import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import { adminSettings, dailyMenuItems, dailyMenus, dishes, orderItems, orders } from "../../db/schema";
import { todayInTashkent } from "./catalog";
import { AppError } from "./errors";
import { normalizeSiteSettings } from "./site-settings";

const idSchema = z.union([z.number(), z.string().regex(/^[1-9]\d*$/).transform(Number)])
  .pipe(z.number().int().positive().max(2_147_483_647));
const orderSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(40).regex(/^\+?[\d\s()-]+$/)
    .refine((value) => { const length = value.replace(/\D/g, "").length; return length >= 9 && length <= 15; }),
  address: z.string().trim().min(3).max(300),
  locationUrl: z.string().trim().max(500).default("").refine((value) => {
    if (!value) return true;
    try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
  }),
  note: z.string().trim().max(500).default(""),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  items: z.array(z.object({ id: idSchema, quantity: z.number().int().min(1).max(99) })).min(1).max(20),
}).refine((value) => (value.latitude === undefined) === (value.longitude === undefined));

export function parseOrder(input: unknown) {
  const result = orderSchema.safeParse(input);
  if (!result.success) throw new AppError("Ism, telefon, manzil va taom sonini to‘g‘ri kiriting.");
  const quantities = new Map<number, number>();
  for (const item of result.data.items) {
    const quantity = (quantities.get(item.id) ?? 0) + item.quantity;
    if (quantity > 99) throw new AppError("Bitta taom soni 99 tadan oshmasin.");
    quantities.set(item.id, quantity);
  }
  // All writers lock dish rows in the same order to avoid deadlocks.
  const items = [...quantities].sort(([a], [b]) => a - b).map(([id, quantity]) => ({ id, quantity }));
  return { ...result.data, items };
}

export async function createOrder(input: unknown) {
  const payload = parseOrder(input);
  const date = todayInTashkent();
  return getDb().transaction(async (tx) => {
    const [setting] = await tx.select().from(adminSettings).where(eq(adminSettings.key, "site_settings"));
    let settings;
    try { settings = normalizeSiteSettings(setting ? JSON.parse(setting.value) : {}); }
    catch { throw new AppError("Sayt sozlamalarini yuklab bo‘lmadi.", 503); }
    if (!settings.acceptingOrders) throw new AppError("Buyurtmalar vaqtincha yopiq.", 409, "ORDERS_CLOSED");

    const resolved: Array<{ id: number; name: string; quantity: number; unitPrice: number; subtotal: number }> = [];
    const stock: Array<{ id: number; quantity: number }> = [];
    for (const item of payload.items) {
      const [row] = await tx.select({ dish: dishes }).from(dishes)
        .innerJoin(dailyMenuItems, eq(dailyMenuItems.dishId, dishes.id))
        .innerJoin(dailyMenus, eq(dailyMenus.id, dailyMenuItems.menuId))
        .where(and(eq(dishes.id, item.id), eq(dishes.isActive, 1), eq(dailyMenus.menuDate, date), eq(dailyMenus.isPublished, 1)))
        .for("update", { of: dishes });
      if (!row) throw new AppError("Tanlangan taom bugungi menyuda yo‘q. Menyuni yangilang.", 409, "DISH_UNAVAILABLE");
      const product = row.dish;
      if (product.quantity < item.quantity) throw new AppError(`${product.nameUz} uchun mavjud son yetarli emas.`, 409, "INSUFFICIENT_STOCK");
      if (product.price <= 0) throw new AppError("Taom narxi sozlanmagan.", 409);
      const remaining = product.quantity - item.quantity;
      await tx.update(dishes).set({ quantity: remaining, updatedAt: new Date().toISOString() }).where(eq(dishes.id, item.id));
      stock.push({ id: item.id, quantity: remaining });
      resolved.push({ id: item.id, name: product.nameUz, quantity: item.quantity, unitPrice: product.price, subtotal: product.price * item.quantity });
    }
    const total = resolved.reduce((sum, item) => sum + item.subtotal, 0);
    if (!Number.isSafeInteger(total) || total > 2_147_483_647) throw new AppError("Buyurtma summasi juda katta.");
    const number = `CL-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    const [order] = await tx.insert(orders).values({
      orderNumber: number, customerName: payload.name, phone: payload.phone, address: payload.address,
      locationUrl: payload.locationUrl, note: payload.note, latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null, total, status: "new",
    }).returning();
    await tx.insert(orderItems).values(resolved.map((item) => ({
      orderId: order.id, dishId: item.id, dishName: item.name, quantity: item.quantity,
      unitPrice: item.unitPrice, subtotal: item.subtotal,
    })));
    return { order, items: resolved, stock };
  });
}

export async function changeOrderStatus(id: number, status: "accepted" | "cancelled") {
  return getDb().transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
    if (!order) throw new AppError("Buyurtma topilmadi.", 404);
    if (order.status === status) return; // Retried cancellations must not replenish twice.
    if (order.status === "cancelled") throw new AppError("Bekor qilingan buyurtmani qayta qabul qilib bo‘lmaydi.", 409);
    if (status === "cancelled") {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(orderItems.dishId);
      for (const item of items) {
        if (item.dishId !== null) await tx.update(dishes).set({
          quantity: sql`${dishes.quantity} + ${item.quantity}`, updatedAt: new Date().toISOString(),
        }).where(eq(dishes.id, item.dishId));
      }
    }
    await tx.update(orders).set({ status }).where(eq(orders.id, id));
  });
}
