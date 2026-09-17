import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { dailyMenuItems, dailyMenus, dishes } from "../../../../db/schema";
import { todayInTashkent } from "../../../lib/catalog";
import { requireAdminApi } from "../../../lib/admin";

function textValue(value: unknown, fallback = "", max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

export async function GET(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  const date = new URL(request.url).searchParams.get("date") || todayInTashkent();
  try {
    const db = getDb();
    const catalog = await db.select().from(dishes).orderBy(asc(dishes.id));
    const [menu] = await db.select({ id: dailyMenus.id }).from(dailyMenus).where(eq(dailyMenus.menuDate, date)).limit(1);
    const menuItems = menu ? await db.select({ dishId: dailyMenuItems.dishId }).from(dailyMenuItems).where(eq(dailyMenuItems.menuId, menu.id)) : [];
    return Response.json({ date, dishes: catalog.map((dish) => ({ ...dish, isActive: Boolean(dish.isActive), inMenu: menuItems.some((item) => item.dishId === dish.id) })) });
  } catch {
    return Response.json({ error: "Katalogni yuklab bo‘lmadi." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const db = getDb();
    if (payload.action === "toggle-menu") {
      const dishId = Number(payload.dishId);
      const date = textValue(payload.date, todayInTashkent());
      const enabled = Boolean(payload.enabled);
      if (!Number.isInteger(dishId) || !date) return Response.json({ error: "Menyu ma’lumotlari noto‘g‘ri." }, { status: 400 });
      let [menu] = await db.select().from(dailyMenus).where(eq(dailyMenus.menuDate, date)).limit(1);
      if (!menu) {
        [menu] = await db.insert(dailyMenus).values({ menuDate: date }).returning();
      }
      const [existing] = await db.select().from(dailyMenuItems).where(and(eq(dailyMenuItems.menuId, menu.id), eq(dailyMenuItems.dishId, dishId))).limit(1);
      if (enabled && !existing) await db.insert(dailyMenuItems).values({ menuId: menu.id, dishId });
      if (!enabled && existing) await db.delete(dailyMenuItems).where(eq(dailyMenuItems.id, existing.id));
      return Response.json({ success: true, inMenu: enabled });
    }

    const nameUz = textValue(payload.nameUz);
    const price = Math.max(0, Math.floor(Number(payload.price) || 0));
    const date = textValue(payload.date, todayInTashkent());
    if (!nameUz || !price || !date) return Response.json({ error: "O‘zbekcha nom, narx va menyu kuni majburiy." }, { status: 400 });
    const [dish] = await db.insert(dishes).values({
      nameUz,
      nameEn: textValue(payload.nameEn, nameUz),
      nameRu: textValue(payload.nameRu, nameUz),
      descriptionUz: textValue(payload.descriptionUz),
      descriptionEn: textValue(payload.descriptionEn, textValue(payload.descriptionUz)),
      descriptionRu: textValue(payload.descriptionRu, textValue(payload.descriptionUz)),
      price,
      quantity: Math.max(0, Math.floor(Number(payload.quantity) || 0)),
      imageUrl: textValue(payload.imageUrl, "", 1000),
      emoji: textValue(payload.emoji, "🍱"),
    }).returning();
    let [menu] = await db.select().from(dailyMenus).where(eq(dailyMenus.menuDate, date)).limit(1);
    if (!menu) {
      [menu] = await db.insert(dailyMenus).values({ menuDate: date }).returning();
    }
    await db.insert(dailyMenuItems).values({ menuId: menu.id, dishId: dish.id });
    return Response.json({ dish: { ...dish, isActive: Boolean(dish.isActive), inMenu: true }, date }, { status: 201 });
  } catch {
    return Response.json({ error: "Taomni saqlab bo‘lmadi." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id)) return Response.json({ error: "Taom topilmadi." }, { status: 400 });
    const db = getDb();
    await db.update(dishes).set({
      nameUz: textValue(payload.nameUz),
      nameEn: textValue(payload.nameEn),
      nameRu: textValue(payload.nameRu),
      descriptionUz: textValue(payload.descriptionUz),
      descriptionEn: textValue(payload.descriptionEn),
      descriptionRu: textValue(payload.descriptionRu),
      price: Math.max(0, Math.floor(Number(payload.price) || 0)),
      quantity: Math.max(0, Math.floor(Number(payload.quantity) || 0)),
      imageUrl: textValue(payload.imageUrl, "", 1000),
      emoji: textValue(payload.emoji, "🍱"),
      isActive: payload.isActive === false ? 0 : 1,
      updatedAt: new Date().toISOString(),
    }).where(eq(dishes.id, id));
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Taomni yangilab bo‘lmadi." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "Taom topilmadi." }, { status: 400 });
    const db = getDb();
    await db.delete(dailyMenuItems).where(eq(dailyMenuItems.dishId, id));
    await db.delete(dishes).where(eq(dishes.id, id));
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Taomni o‘chirib bo‘lmadi." }, { status: 500 });
  }
}
