import { sendTelegramMessage } from "../../lib/admin";
import { errorResponse } from "../../lib/errors";
import { createOrder } from "../../lib/order-service";

export async function POST(request: Request) {
  try {
    const { order, items, stock } = await createOrder(await request.json().catch(() => null));
    const lines = [
      `🍽 Yangi CHEF LUNCH buyurtmasi #${order.orderNumber}`,
      `Mijoz: ${order.customerName}`,
      `Telefon: ${order.phone}`,
      `Manzil: ${order.address}`,
      order.locationUrl ? `Lokatsiya: ${order.locationUrl}` : "",
      ...items.map((item) => `• ${item.name} × ${item.quantity} — ${item.subtotal.toLocaleString("uz-UZ")} so‘m`),
      `Jami: ${order.total.toLocaleString("uz-UZ")} so‘m`,
      order.note ? `Izoh: ${order.note}` : "",
      "Admin panelida buyurtmani qabul qiling yoki bekor qiling.",
    ].filter(Boolean).join("\n");
    // Notification failure must never turn a committed order into a failed checkout.
    const telegram = await sendTelegramMessage(lines).catch(() => ({ ok: false }));
    return Response.json({
      success: true, telegramNotified: telegram.ok,
      order: { orderNumber: order.orderNumber, total: order.total }, stock,
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Buyurtmani saqlashda xatolik yuz berdi.");
  }
}
