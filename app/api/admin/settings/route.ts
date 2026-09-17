import { getTelegramConfig, requireAdminApi, saveSiteSettings, saveTelegramConfig, sendTelegramMessage, getSiteSettings } from "../../../lib/admin";
import { errorResponse } from "../../../lib/errors";

function textValue(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  try {
    const [settings, telegram] = await Promise.all([getSiteSettings(), getTelegramConfig()]);
    return Response.json({ settings, telegram: { configured: Boolean(telegram.botToken && telegram.chatId), chatId: telegram.chatId } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Sozlamalarni yuklab bo‘lmadi.");
  }
}

export async function PATCH(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return Response.json({ error: "Noto‘g‘ri so‘rov." }, { status: 400 });
  try {
    if (payload.type === "site") {
      if (!payload.settings || typeof payload.settings !== "object" || Array.isArray(payload.settings)) return Response.json({ error: "Sozlamalarni kiriting." }, { status: 400 });
      const settings = await saveSiteSettings(payload.settings);
      return Response.json({ success: true, settings });
    }
    if (payload.type === "telegram") {
      if (payload.disconnect === true) {
        await saveTelegramConfig({ botToken: "", chatId: "" });
        return Response.json({ success: true, telegram: { configured: false, chatId: "" } });
      }
      const current = await getTelegramConfig();
      const botToken = textValue(payload.botToken, 300) || current.botToken;
      const chatId = textValue(payload.chatId, 100) || current.chatId;
      if (!botToken || !chatId) return Response.json({ error: "Bot token va Chat ID ni kiriting." }, { status: 400 });
      await saveTelegramConfig({ botToken, chatId });
      return Response.json({ success: true, telegram: { configured: true, chatId } });
    }
    return Response.json({ error: "Sozlama turi topilmadi." }, { status: 400 });
  } catch (error) {
    return errorResponse(error, "Sozlamalarni saqlab bo‘lmadi.");
  }
}

export async function POST(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (payload?.action !== "test-telegram") return Response.json({ error: "Noma’lum amal." }, { status: 400 });
  const result = await sendTelegramMessage("✅ CHEF LUNCH Telegram bot ulanishi muvaffaqiyatli ishlayapti.");
  return result.ok ? Response.json({ success: true }) : Response.json({ error: result.error }, { status: 400 });
}
