import { desc, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { orderItems, orders } from "../../../../db/schema";
import { requireAdminApi } from "../../../lib/admin";
import { errorResponse } from "../../../lib/errors";
import { changeOrderStatus } from "../../../lib/order-service";

export async function GET(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  try {
    const db = getDb();
    const rows = await db.select().from(orders).orderBy(desc(orders.createdAt), desc(orders.id)).limit(100);
    const items = rows.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, rows.map((order) => order.id))) : [];
    return Response.json({ orders: rows.map((order) => ({
      ...order, items: items.filter((item) => item.orderId === order.id),
    })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Buyurtmalarni yuklab bo‘lmadi.");
  }
}

export async function PATCH(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  try {
    const payload = await request.json().catch(() => null);
    const id = Number(payload?.id);
    const status = payload?.status;
    if (!Number.isInteger(id) || id <= 0 || !["accepted", "cancelled"].includes(status)) {
      return Response.json({ error: "Noto‘g‘ri buyurtma holati." }, { status: 400 });
    }
    await changeOrderStatus(id, status);
    return Response.json({ success: true, status });
  } catch (error) {
    return errorResponse(error, "Buyurtma holatini o‘zgartirib bo‘lmadi.");
  }
}
