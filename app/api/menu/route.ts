import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { dailyMenuItems, dailyMenus, dishes } from "../../../db/schema";
import { todayInTashkent } from "../../lib/catalog";

export async function GET(request: Request) {
  const requestedDate = new URL(request.url).searchParams.get("date") || todayInTashkent();
  try {
    const db = getDb();
    const [menu] = await db
      .select({ id: dailyMenus.id, isPublished: dailyMenus.isPublished })
      .from(dailyMenus)
      .where(eq(dailyMenus.menuDate, requestedDate))
      .limit(1);
    const rows = await db
      .select({
        id: dishes.id,
        nameUz: dishes.nameUz,
        nameEn: dishes.nameEn,
        nameRu: dishes.nameRu,
        descriptionUz: dishes.descriptionUz,
        descriptionEn: dishes.descriptionEn,
        descriptionRu: dishes.descriptionRu,
        price: dishes.price,
        quantity: dishes.quantity,
        imageUrl: dishes.imageUrl,
        emoji: dishes.emoji,
        isActive: dishes.isActive,
      })
      .from(dishes)
      .innerJoin(dailyMenuItems, eq(dailyMenuItems.dishId, dishes.id))
      .innerJoin(dailyMenus, eq(dailyMenus.id, dailyMenuItems.menuId))
      .where(and(eq(dailyMenus.menuDate, requestedDate), eq(dailyMenus.isPublished, 1), eq(dishes.isActive, 1)))
      .orderBy(asc(dailyMenuItems.sortOrder), asc(dishes.id));

    // Older catalog entries may exist before the first daily menu was created.
    // Show those active entries once, but never bring back hard-coded demo dishes.
    const fallbackRows = !menu
      ? await db
        .select({
          id: dishes.id,
          nameUz: dishes.nameUz,
          nameEn: dishes.nameEn,
          nameRu: dishes.nameRu,
          descriptionUz: dishes.descriptionUz,
          descriptionEn: dishes.descriptionEn,
          descriptionRu: dishes.descriptionRu,
          price: dishes.price,
          quantity: dishes.quantity,
          imageUrl: dishes.imageUrl,
          emoji: dishes.emoji,
          isActive: dishes.isActive,
        })
        .from(dishes)
        .where(eq(dishes.isActive, 1))
        .orderBy(asc(dishes.id))
      : [];
    const items = rows.length ? rows : fallbackRows;

    return Response.json({
      date: requestedDate,
      items: items.map((row) => ({ ...row, isActive: Boolean(row.isActive) })),
    });
  } catch {
    return Response.json({ date: requestedDate, items: [], fallback: true });
  }
}
