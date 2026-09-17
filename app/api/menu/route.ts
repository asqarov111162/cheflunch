import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { dailyMenuItems, dailyMenus, dishes } from "../../../db/schema";
import { todayInTashkent } from "../../lib/catalog";
import { errorResponse } from "../../lib/errors";

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") || todayInTashkent();
  try {
    const rows = await getDb().select({ dish: dishes }).from(dishes)
      .innerJoin(dailyMenuItems, eq(dailyMenuItems.dishId, dishes.id))
      .innerJoin(dailyMenus, eq(dailyMenus.id, dailyMenuItems.menuId))
      .where(and(eq(dailyMenus.menuDate, date), eq(dailyMenus.isPublished, 1), eq(dishes.isActive, 1)))
      .orderBy(asc(dailyMenuItems.sortOrder), asc(dishes.id));
    return Response.json({
      date,
      items: rows.map(({ dish }) => ({ ...dish, isActive: Boolean(dish.isActive) })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Menyuni yuklash imkoni bo‘lmadi. Keyinroq qayta urinib ko‘ring.");
  }
}
