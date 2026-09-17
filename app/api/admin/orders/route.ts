import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { orderItems, orders } from "../../../../db/schema";
import { requireAdminApi } from "../../../lib/admin";

export async function GET(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  try {
    const db = getDb();
    const rows = await db.select().from(orders).orderBy(desc(orders.createdAt), desc(orders.id)).limit(100);
    const hydrated = await Promise.all(rows.map(async (order) => ({
      ...order,
      items: await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    })));
    return Response.json({ orders: hydrated });
  } catch {
    return Response.json({ error: "Buyurtmalarni yuklab bo‘lmadi." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  try {
    const payload = (await request.json()) as { id?: number; status?: string };
    const id = Number(payload.id);
    const status = payload.status === "accepted" || payload.status === "cancelled" ? payload.status : "";
    if (!Number.isInteger(id) || !status) return Response.json({ error: "Noto‘g‘ri buyurtma holati." }, { status: 400 });
    const db = getDb();
    await db.update(orders).set({ status }).where(eq(orders.id, id));
    return Response.json({ success: true, status });
  } catch {
    return Response.json({ error: "Buyurtma holatini o‘zgartirib bo‘lmadi." }, { status: 500 });
  }
}
