import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { dishes, orderItems, orders } from "../../../db/schema";
import { sendTelegramMessage } from "../../lib/admin";

type IncomingItem = { id?: string | number; quantity?: number };

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function orderNumber() {
  return `CL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function notifyTelegram(order: {
  number: string;
  name: string;
  phone: string;
  address: string;
  locationUrl: string;
  note: string;
  total: number;
  items: Array<{ name: string; quantity: number; subtotal: number }>;
}) {
  const lines = [
    `🍽 Yangi CHEF LUNCH buyurtmasi #${order.number}`,
    "",
    `Mijoz: ${order.name}`,
    `Telefon: ${order.phone}`,
    `Manzil: ${order.address}`,
    order.locationUrl ? `Lokatsiya: ${order.locationUrl}` : "",
    "",
    ...order.items.map((item) => `• ${item.name} × ${item.quantity} — ${item.subtotal.toLocaleString("uz-UZ")} so‘m`),
    "",
    `Jami: ${order.total.toLocaleString("uz-UZ")} so‘m`,
    order.note ? `Izoh: ${order.note}` : "",
    "",
    "Admin panelida buyurtmani qabul qiling yoki bekor qiling.",
  ].filter(Boolean).join("\n");

  const result = await sendTelegramMessage(lines);
  return result.ok;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      items?: IncomingItem[];
      name?: string;
      phone?: string;
      address?: string;
      locationUrl?: string;
      latitude?: number;
      longitude?: number;
      note?: string;
    };
    const name = clean(payload.name, 100);
    const phone = clean(payload.phone, 40);
    const address = clean(payload.address, 300);
    const locationUrl = clean(payload.locationUrl, 500);
    const note = clean(payload.note, 500);
    const incoming = Array.isArray(payload.items) ? payload.items : [];
    if (!name || !phone || !address || !incoming.length) {
      return Response.json({ error: "Ism, telefon, manzil va kamida bitta taom kerak." }, { status: 400 });
    }

    const db = getDb();
    const resolvedByDish = new Map<number, { id: number; name: string; quantity: number; unitPrice: number; subtotal: number }>();
    for (const incomingItem of incoming.slice(0, 20)) {
      const quantity = Math.max(1, Math.min(99, Math.floor(Number(incomingItem.quantity) || 0)));
      if (!quantity) continue;
      const numericId = Number(incomingItem.id);
      let product: { id: number; name: string; price: number; quantity: number } | undefined;
      if (Number.isInteger(numericId) && numericId > 0) {
        const [row] = await db.select({ id: dishes.id, name: dishes.nameUz, price: dishes.price, quantity: dishes.quantity }).from(dishes).where(eq(dishes.id, numericId)).limit(1);
        if (row) product = row;
      }
      if (!product) return Response.json({ error: "Tanlangan taom topilmadi." }, { status: 400 });
      if (quantity > product.quantity) return Response.json({ error: `${product.name} uchun mavjud son yetarli emas.` }, { status: 400 });
      const existing = resolvedByDish.get(product.id);
      if (existing) {
        existing.quantity += quantity;
        existing.subtotal += product.price * quantity;
      } else {
        resolvedByDish.set(product.id, { id: product.id, name: product.name, quantity, unitPrice: product.price, subtotal: product.price * quantity });
      }
    }
    const resolved = Array.from(resolvedByDish.values());
    if (!resolved.length) return Response.json({ error: "Buyurtmada taomlar yo‘q." }, { status: 400 });

    const total = resolved.reduce((sum, item) => sum + item.subtotal, 0);
    const number = orderNumber();
    const created = await db.transaction(async (tx) => {
      for (const item of resolved) {
        const [updated] = await tx.update(dishes)
          .set({ quantity: sql`${dishes.quantity} - ${item.quantity}` })
          .where(and(eq(dishes.id, item.id), gte(dishes.quantity, item.quantity)))
          .returning({ id: dishes.id });
        if (!updated) throw new Error(`INSUFFICIENT_STOCK:${item.name}`);
      }

      const [order] = await tx.insert(orders).values({
        orderNumber: number,
        customerName: name,
        phone,
        address,
        locationUrl,
        latitude: typeof payload.latitude === "number" ? payload.latitude : null,
        longitude: typeof payload.longitude === "number" ? payload.longitude : null,
        note,
        total,
        status: "new",
      }).returning({ id: orders.id, orderNumber: orders.orderNumber });

      await tx.insert(orderItems).values(resolved.map((item) => ({ orderId: order.id, dishId: item.id, dishName: item.name, quantity: item.quantity, unitPrice: item.unitPrice, subtotal: item.subtotal })));
      return order;
    });
    const telegramNotified = await notifyTelegram({ number, name, phone, address, locationUrl, note, total, items: resolved });
    return Response.json({ success: true, telegramNotified, order: { orderNumber: created.orderNumber, total } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("INSUFFICIENT_STOCK:")) {
      return Response.json({ error: `${error.message.slice("INSUFFICIENT_STOCK:".length)} uchun mavjud son yetarli emas.` }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Buyurtmani saqlashda xatolik yuz berdi.";
    return Response.json({ error: message.includes("D1 binding") ? "Buyurtma bazasi hali sozlanmagan." : "Buyurtmani saqlashda xatolik yuz berdi." }, { status: 500 });
  }
}
