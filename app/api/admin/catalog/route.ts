import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../db";
import { dailyMenuItems, dailyMenus, dishes } from "../../../../db/schema";
import { todayInTashkent } from "../../../lib/catalog";
import { requireAdminApi } from "../../../lib/admin";
import { AppError, errorResponse } from "../../../lib/errors";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
});
const optionalText = z.string().trim().max(500).default("");
const dishSchema = z.object({
  nameUz: z.string().trim().min(1).max(500),
  nameEn: optionalText, nameRu: optionalText,
  descriptionUz: optionalText, descriptionEn: optionalText, descriptionRu: optionalText,
  price: z.number().int().min(1).max(10_000_000),
  quantity: z.number().int().min(0).max(1_000_000),
  imageUrl: z.string().trim().max(1000).default("").refine((value) => {
    if (!value || (value.startsWith("/") && !value.startsWith("//"))) return true;
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  }),
  emoji: z.string().trim().max(32).default("🍱"),
  isActive: z.boolean().default(true),
});
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError("Taom nomi, narxi, soni yoki sana noto‘g‘ri.");
  return result.data;
}
function dishValues(input: unknown) {
  const data = parse(dishSchema, input);
  return {
    ...data, nameEn: data.nameEn || data.nameUz, nameRu: data.nameRu || data.nameUz,
    descriptionEn: data.descriptionEn || data.descriptionUz,
    descriptionRu: data.descriptionRu || data.descriptionUz,
    isActive: data.isActive ? 1 : 0,
  };
}

export async function GET(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  try {
    const date = parse(dateSchema, new URL(request.url).searchParams.get("date") || todayInTashkent());
    const db = getDb();
    const catalog = await db.select().from(dishes).orderBy(asc(dishes.id));
    const menuItems = await db.select({ dishId: dailyMenuItems.dishId }).from(dailyMenuItems)
      .innerJoin(dailyMenus, eq(dailyMenus.id, dailyMenuItems.menuId)).where(eq(dailyMenus.menuDate, date));
    const inMenu = new Set(menuItems.map((item) => item.dishId));
    return Response.json({ date, dishes: catalog.map((dish) => ({
      ...dish, isActive: Boolean(dish.isActive), inMenu: inMenu.has(dish.id),
    })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Katalogni yuklab bo‘lmadi.");
  }
}

export async function POST(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  try {
    const payload = await request.json().catch(() => null);
    const date = parse(dateSchema, payload?.date || todayInTashkent());
    const db = getDb();
    if (payload?.action === "toggle-menu") {
      const { dishId, enabled } = parse(z.object({ dishId: z.number().int().positive(), enabled: z.boolean() }), payload);
      await db.transaction(async (tx) => {
        const [dish] = await tx.select({ id: dishes.id }).from(dishes).where(eq(dishes.id, dishId)).for("update");
        if (!dish) throw new AppError("Taom topilmadi.", 404);
        const [menu] = await tx.insert(dailyMenus).values({ menuDate: date })
          .onConflictDoUpdate({ target: dailyMenus.menuDate, set: { menuDate: date } }).returning();
        if (enabled) await tx.insert(dailyMenuItems).values({ menuId: menu.id, dishId }).onConflictDoNothing();
        else await tx.delete(dailyMenuItems).where(and(eq(dailyMenuItems.menuId, menu.id), eq(dailyMenuItems.dishId, dishId)));
      });
      return Response.json({ success: true, inMenu: enabled });
    }
    const values = dishValues(payload);
    const dish = await db.transaction(async (tx) => {
      const [created] = await tx.insert(dishes).values(values).returning();
      const [menu] = await tx.insert(dailyMenus).values({ menuDate: date })
        .onConflictDoUpdate({ target: dailyMenus.menuDate, set: { menuDate: date } }).returning();
      await tx.insert(dailyMenuItems).values({ menuId: menu.id, dishId: created.id });
      return created;
    });
    return Response.json({ dish: { ...dish, isActive: Boolean(dish.isActive), inMenu: true }, date }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Taomni saqlab bo‘lmadi.");
  }
}

export async function PATCH(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  try {
    const payload = await request.json().catch(() => null);
    const id = parse(z.number().int().positive(), payload?.id);
    const values = dishValues(payload);
    const [updated] = await getDb().update(dishes).set({ ...values, updatedAt: new Date().toISOString() })
      .where(eq(dishes.id, id)).returning({ id: dishes.id });
    if (!updated) throw new AppError("Taom topilmadi.", 404);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "Taomni yangilab bo‘lmadi.");
  }
}

export async function DELETE(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  try {
    const id = parse(z.number().int().positive(), Number(new URL(request.url).searchParams.get("id")));
    await getDb().transaction(async (tx) => {
      const [dish] = await tx.select({ id: dishes.id }).from(dishes).where(eq(dishes.id, id)).for("update");
      if (!dish) throw new AppError("Taom topilmadi.", 404);
      await tx.delete(dailyMenuItems).where(eq(dailyMenuItems.dishId, id));
      await tx.delete(dishes).where(eq(dishes.id, id));
    });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "Taomni o‘chirib bo‘lmadi.");
  }
}
