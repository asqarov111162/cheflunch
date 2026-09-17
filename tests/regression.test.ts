import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import type { ChefLunchDatabase } from "../db";
import * as schema from "../db/schema";
import { databaseUrl, initializationStatements } from "../scripts/setup-db.mjs";
import { POST as auth, GET as authState } from "../app/api/admin/auth/route";
import * as catalog from "../app/api/admin/catalog/route";
import { GET as menu } from "../app/api/menu/route";
import { GET as settings } from "../app/api/settings/route";
import { POST as checkout } from "../app/api/orders/route";
import { POST as upload } from "../app/api/admin/uploads/route";
import { GET as adminOrders } from "../app/api/admin/orders/route";
import {
  createAdminSession, getAdminPasswordHash, getAdminSession, getAdminUser,
  getTelegramConfig, hashPassword, saveAdminPassword, saveSiteSettings,
  saveTelegramConfig, sendTelegramMessage, verifyPassword,
} from "../app/lib/admin";
import { todayInTashkent } from "../app/lib/catalog";
import { publicError } from "../app/lib/errors";
import { createOrder, changeOrderStatus, parseOrder } from "../app/lib/order-service";

const pg = new PGlite();
const db = drizzle(pg, { schema });
const globals = globalThis as typeof globalThis & { chefLunchDb?: ChefLunchDatabase };
const envKeys = ["DATABASE_URL", "ADMIN_EMAILS", "ADMIN_SESSION_SECRET", "ADMIN_SETUP_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID"];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const testSetupKey = "test-only-setup-key-01234567890123456789";

before(async () => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
  process.env.ADMIN_EMAILS = "owner@example.org";
  process.env.ADMIN_SESSION_SECRET = "test-only-session-key-01234567890123456789";
  process.env.ADMIN_SETUP_KEY = testSetupKey;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
  globals.chefLunchDb = db as unknown as ChefLunchDatabase;
  for (const sql of await initializationStatements()) await pg.exec(sql);
});

beforeEach(async () => {
  await pg.exec("TRUNCATE dishes, daily_menus, daily_menu_items, orders, order_items, admin_settings RESTART IDENTITY");
});

after(async () => {
  delete globals.chefLunchDb;
  for (const key of envKeys) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
  await pg.close();
});

function request(path: string, method = "GET", body?: unknown, cookie?: string) {
  const headers = new Headers({ origin: "http://localhost" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return new Request("http://localhost" + path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

async function adminCookie() {
  await saveAdminPassword("test-password-123");
  const user = await getAdminUser();
  assert.ok(user);
  return "chef_lunch_admin_session=" + await createAdminSession(user);
}

async function seedDish(quantity = 5, inMenu = true) {
  const [dish] = await db.insert(schema.dishes).values({ nameUz: "Osh", price: 30_000, quantity }).returning();
  if (inMenu) {
    const [daily] = await db.insert(schema.dailyMenus).values({ menuDate: todayInTashkent() })
      .onConflictDoUpdate({ target: schema.dailyMenus.menuDate, set: { isPublished: 1 } }).returning();
    await db.insert(schema.dailyMenuItems).values({ menuId: daily.id, dishId: dish.id });
  }
  return dish;
}

function orderInput(id: number, quantity = 1) {
  return { name: "Test Mijoz", phone: "+998901234567", address: "Toshkent, Test ko‘chasi 1", items: [{ id, quantity }] };
}

async function stock(id: number) {
  const [dish] = await db.select().from(schema.dishes).where(eq(schema.dishes.id, id));
  return dish?.quantity;
}

test("lockfile is complete JSON and agrees with package.json", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const lockText = await readFile("package-lock.json", "utf8");
  assert.ok(!lockText.includes("Warning: truncated output"));
  const lock = JSON.parse(lockText);
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.packages[""].dependencies, pkg.dependencies);
  assert.deepEqual(lock.packages[""].devDependencies, pkg.devDependencies);
  assert.equal(pkg.engines.node, "24.x");
  const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
  assert.equal(vercel.installCommand, "npm ci");
  assert.equal(vercel.buildCommand, "npm run build:vercel");
  assert.equal(vercel.framework, "nextjs");
});

test("database URL validation does not leak credentials", () => {
  assert.throws(() => databaseUrl({}), /DATABASE_URL/);
  assert.throws(() => databaseUrl({ DATABASE_URL: "secret-not-a-url" }), (error: unknown) => error instanceof Error && !error.message.includes("secret-not-a-url"));
  assert.equal(databaseUrl({ DATABASE_URL: "  postgresql://test:test@localhost/test  " }), "postgresql://test:test@localhost/test");
});

test("repeatable database setup preserves existing data", async () => {
  const dish = await seedDish();
  const statements = await initializationStatements();
  assert.equal(statements.length, 6);
  for (const sql of statements) await pg.exec(sql);
  assert.equal(await stock(dish.id), 5);
});

test("missing database disables checkout and never presents password setup", async () => {
  const value = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const menuResponse = await menu(request("/api/menu"));
    assert.equal(menuResponse.status, 503);
    assert.equal((await menuResponse.json()).code, "DATABASE_NOT_CONFIGURED");
    const settingsResponse = await settings();
    assert.equal(settingsResponse.status, 503);
    assert.equal((await settingsResponse.json()).acceptingOrders, false);
    assert.equal((await authState(request("/api/admin/auth")))?.status, 503);
    assert.equal((await checkout(request("/api/orders", "POST", orderInput(1)))).status, 503);
  } finally { process.env.DATABASE_URL = value; }
});

test("nested missing-table errors have actionable safe responses", () => {
  const result = publicError({ cause: { code: "42P01" } });
  assert.equal(result.status, 503);
  assert.equal(result.code, "DATABASE_SCHEMA_MISSING");
});

test("first password requires the setup key and cannot be overwritten", async () => {
  const denied = await auth(request("/api/admin/auth", "POST", { action: "setup", password: "new-password-123" }));
  assert.equal(denied?.status, 403);
  assert.equal(await getAdminPasswordHash(), null);
  const response = await auth(request("/api/admin/auth", "POST", { action: "setup", password: "new-password-123", setupKey: testSetupKey }));
  assert.equal(response?.status, 200);
  assert.match(response!.headers.get("set-cookie")!, /HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await auth(request("/api/admin/auth", "POST", { action: "setup", password: "other-password-123", setupKey: testSetupKey })))?.status, 409);
  assert.ok(await verifyPassword("new-password-123", (await getAdminPasswordHash())!));
});

test("passwords preserve spaces and wrong passwords are rejected", async () => {
  const hash = await hashPassword(" password with spaces ");
  assert.match(hash, /^pbkdf2\$600000\$/);
  assert.equal(await verifyPassword(" password with spaces ", hash), true);
  assert.equal(await verifyPassword("password with spaces", hash), false);
  assert.equal(await verifyPassword("anything", "malformed"), false);
});

test("changing password invalidates old sessions; tampered cookies fail", async () => {
  const cookie = await adminCookie();
  assert.ok(await getAdminSession(new Headers({ cookie })));
  assert.equal(await getAdminSession(new Headers({ cookie: cookie + "x" })), null);
  const changed = await auth(request("/api/admin/auth", "POST", { action: "change-password", currentPassword: "test-password-123", newPassword: "changed-password-123" }, cookie));
  assert.equal(changed?.status, 200);
  assert.equal(await getAdminSession(new Headers({ cookie })), null);
  const newCookie = changed!.headers.get("set-cookie")!.split(";")[0];
  assert.ok(await getAdminSession(new Headers({ cookie: newCookie })));
});

test("admin APIs reject unauthenticated and cross-origin writes", async () => {
  assert.equal((await catalog.GET(request("/api/admin/catalog"))).status, 401);
  assert.equal((await adminOrders(request("/api/admin/orders"))).status, 401);
  const cookie = await adminCookie();
  const foreign = request("/api/admin/catalog", "POST", { nameUz: "Osh" }, cookie);
  foreign.headers.set("origin", "https://another-site.example");
  assert.equal((await catalog.POST(foreign)).status, 403);
});

test("catalog create/edit/delete is reflected in the public daily menu", async () => {
  const cookie = await adminCookie();
  const response = await catalog.POST(request("/api/admin/catalog", "POST", { nameUz: "Sho‘rva", price: 25_000, quantity: 8, date: todayInTashkent() }, cookie));
  assert.equal(response.status, 201);
  const { dish } = await response.json();
  let items = (await (await menu(request("/api/menu"))).json()).items;
  assert.equal(items.length, 1);
  assert.equal(items[0].nameUz, "Sho‘rva");
  assert.equal((await catalog.PATCH(request("/api/admin/catalog", "PATCH", { ...dish, nameUz: "Mastava", quantity: 3 }, cookie))).status, 200);
  items = (await (await menu(request("/api/menu"))).json()).items;
  assert.equal(items[0].nameUz, "Mastava");
  assert.equal(items[0].quantity, 3);
  assert.equal((await catalog.DELETE(request(`/api/admin/catalog?id=${dish.id}`, "DELETE", undefined, cookie))).status, 200);
  assert.deepEqual((await (await menu(request("/api/menu"))).json()).items, []);
});

test("invalid catalog entries and nonexistent IDs are not silently accepted", async () => {
  const cookie = await adminCookie();
  for (const body of [null, { nameUz: "Osh", price: -1, quantity: 5 }, { nameUz: "Osh", price: 1, quantity: 5, date: "2026-02-30" }]) {
    assert.equal((await catalog.POST(request("/api/admin/catalog", "POST", body, cookie))).status, 400);
  }
  assert.equal((await catalog.DELETE(request("/api/admin/catalog?id=999", "DELETE", undefined, cookie))).status, 404);
});

test("menu selection is idempotent and does not show dishes on other dates", async () => {
  const cookie = await adminCookie();
  const dish = await seedDish(5, false);
  assert.deepEqual((await (await menu(request("/api/menu"))).json()).items, []);
  for (let i = 0; i < 2; i++) {
    assert.equal((await catalog.POST(request("/api/admin/catalog", "POST", { action: "toggle-menu", dishId: dish.id, date: todayInTashkent(), enabled: true }, cookie))).status, 200);
  }
  assert.equal((await (await menu(request("/api/menu"))).json()).items.length, 1);
  assert.deepEqual((await (await menu(request("/api/menu?date=2001-01-01"))).json()).items, []);
  await db.update(schema.dishes).set({ isActive: 0 }).where(eq(schema.dishes.id, dish.id));
  assert.deepEqual((await (await menu(request("/api/menu"))).json()).items, []);
});

test("checkout rejects invalid quantities, IDs, phone and unsafe locations", () => {
  for (const quantity of [0, -1, 1.5, 100, "2", null]) assert.throws(() => parseOrder({ ...orderInput(1), items: [{ id: 1, quantity }] }));
  for (const value of [null, {}, { ...orderInput(1), phone: "abc" }, { ...orderInput(1), locationUrl: "javascript:alert(1)" }, { ...orderInput(1), latitude: 91, longitude: 0 }]) assert.throws(() => parseOrder(value));
  assert.equal(parseOrder({ ...orderInput(1), items: [{ id: 1, quantity: 1 }, { id: 1, quantity: 2 }] }).items[0].quantity, 3);
});

test("successful checkout uses server price, deducts stock and preserves snapshots", async () => {
  const dish = await seedDish();
  const result = await createOrder({ ...orderInput(dish.id, 2), total: 1, price: 1 });
  assert.equal(result.order.total, 60_000);
  assert.equal(result.order.status, "new");
  assert.equal(await stock(dish.id), 3);
  assert.equal(result.stock[0].quantity, 3);
  const items = await db.select().from(schema.orderItems);
  assert.equal(items.length, 1);
  assert.equal(items[0].dishName, "Osh");
  assert.equal(items[0].quantity, 2);
});

test("insufficient later item rolls back all earlier stock changes", async () => {
  const first = await seedDish(5);
  const second = await seedDish(1);
  await assert.rejects(createOrder({ ...orderInput(first.id), items: [{ id: first.id, quantity: 2 }, { id: second.id, quantity: 2 }] }));
  assert.equal(await stock(first.id), 5);
  assert.equal(await stock(second.id), 1);
  assert.equal((await db.select().from(schema.orders)).length, 0);
});

test("competing checkouts cannot oversell the final portion", async () => {
  const dish = await seedDish(1);
  const results = await Promise.allSettled([createOrder(orderInput(dish.id)), createOrder(orderInput(dish.id))]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await stock(dish.id), 0);
  assert.equal((await db.select().from(schema.orders)).length, 1);
});

test("closed ordering, inactive dishes and off-menu dishes cannot be bypassed", async () => {
  const dish = await seedDish();
  await saveSiteSettings({ acceptingOrders: false });
  await assert.rejects(createOrder(orderInput(dish.id)), /vaqtincha yopiq/);
  await saveSiteSettings({ acceptingOrders: true });
  await db.update(schema.dishes).set({ isActive: 0 }).where(eq(schema.dishes.id, dish.id));
  await assert.rejects(createOrder(orderInput(dish.id)), /bugungi menyuda/);
  const offMenu = await seedDish(5, false);
  await assert.rejects(createOrder(orderInput(offMenu.id)), /bugungi menyuda/);
  assert.equal(await stock(dish.id), 5);
});

test("cancellation restores stock once and cannot be accepted again", async () => {
  const dish = await seedDish();
  const result = await createOrder(orderInput(dish.id, 2));
  await changeOrderStatus(result.order.id, "accepted");
  assert.equal(await stock(dish.id), 3);
  await Promise.all([changeOrderStatus(result.order.id, "cancelled"), changeOrderStatus(result.order.id, "cancelled")]);
  assert.equal(await stock(dish.id), 5);
  await assert.rejects(changeOrderStatus(result.order.id, "accepted"));
  await assert.rejects(changeOrderStatus(999, "accepted"));
});

test("Telegram disconnect overrides environment fallback", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "test-only-bot-token";
  process.env.TELEGRAM_CHAT_ID = "test-only-chat";
  try {
    await saveTelegramConfig({ botToken: "", chatId: "" });
    assert.deepEqual(await getTelegramConfig(), { botToken: "", chatId: "" });
    assert.equal((await sendTelegramMessage("not sent")).ok, false);
  } finally { delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID; }
});

test("Telegram failure never rolls back or misreports a committed order", async (t) => {
  const dish = await seedDish();
  await saveTelegramConfig({ botToken: "test-only-token", chatId: "test-only-chat" });
  const mockedFetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Simulated offline Telegram"); });
  const response = await checkout(request("/api/orders", "POST", orderInput(dish.id, 2)));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.telegramNotified, false);
  assert.equal(await stock(dish.id), 3);
  assert.equal(mockedFetch.mock.callCount(), 1);
});

test("uploads report missing storage and reject empty or oversized files before sending", async () => {
  const cookie = await adminCookie();
  const makeUpload = (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return new Request("http://localhost/api/admin/uploads", { method: "POST", headers: { cookie, origin: "http://localhost" }, body: form });
  };
  assert.equal((await upload(makeUpload(new File([], "empty.png", { type: "image/png" })))).status, 503);
  process.env.BLOB_READ_WRITE_TOKEN = "test-only-never-sent";
  try {
    for (const file of [new File([], "empty.png", { type: "image/png" }), new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }), new File(["not-a-png"], "fake.png", { type: "image/png" })]) {
      assert.equal((await upload(makeUpload(file))).status, 400);
    }
  } finally { delete process.env.BLOB_READ_WRITE_TOKEN; }
});
