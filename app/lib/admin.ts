import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../../db";
import { adminSettings } from "../../db/schema";
import type { ChatGPTUser } from "../chatgpt-auth";
import { defaultSiteSettings, normalizeSiteSettings, type SiteSettings } from "./site-settings";
import { AppError, errorResponse } from "./errors";

const PASSWORD_KEY = "admin_password_hash";
const SITE_SETTINGS_KEY = "site_settings";
const TELEGRAM_SETTINGS_KEY = "telegram_settings";
const SESSION_COOKIE_NAME = "chef_lunch_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();

export type AdminSession = {
  userId: string;
  email: string;
  expiresAt: number;
  passwordVersion: string;
};

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

function allowedEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function adminIsConfigured() {
  return !adminConfigurationError();
}

export function adminConfigurationError() {
  if (!process.env.DATABASE_URL?.trim()) return "Baza ulanmagan. Vercel’da DATABASE_URL ni kiriting va yangi deploy qiling.";
  if (!allowedEmails().length) return "Vercel sozlamalariga ADMIN_EMAILS — admin email manzilini kiriting.";
  if (!process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET.length < 32 || process.env.ADMIN_SESSION_SECRET.startsWith("replace-with")) {
    return "Vercel’da ADMIN_SESSION_SECRET uchun kamida 32 belgili tasodifiy maxfiy qiymat kiriting.";
  }
  return null;
}

export async function getAdminUser(): Promise<ChatGPTUser | null> {
  const emails = allowedEmails();
  const email = emails[0];
  if (!email) return null;
  return {
    userId: `admin:${email}`,
    displayName: email,
    email,
    fullName: null,
  };
}

export async function requireAdminIdentity() {
  if (!adminIsConfigured()) {
    return { user: null, response: Response.json({ error: adminConfigurationError() }, { status: 503 }) };
  }
  const user = await getAdminUser();
  if (!user) return { user: null, response: Response.json({ error: "Admin email manzili sozlanmagan." }, { status: 503 }) };
  return { user, response: null };
}

export async function requireAdminApi(request?: Request) {
  const identity = await requireAdminIdentity();
  if (identity.response || !identity.user) return identity;
  if (request && !["GET", "HEAD"].includes(request.method) && request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return { user: null, response: Response.json({ error: "Ruxsat etilmagan so‘rov." }, { status: 403 }) };
  }
  let session;
  try { session = await getAdminSession(request?.headers); }
  catch (error) { return { user: null, response: errorResponse(error) }; }
  if (!session || session.userId !== identity.user.userId || session.email.toLowerCase() !== identity.user.email.toLowerCase()) {
    return { user: null, response: Response.json({ error: "Admin paroli bilan kirish kerak." }, { status: 401 }) };
  }
  return identity;
}

async function readSetting(key: string) {
    const db = getDb();
    const [row] = await db
      .select({ value: adminSettings.value })
      .from(adminSettings)
      .where(eq(adminSettings.key, key))
      .limit(1);
    return row?.value ?? null;
}

async function writeSetting(key: string, value: string) {
  const db = getDb();
  const updatedAt = new Date().toISOString();
  await db.insert(adminSettings)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({
      target: adminSettings.key,
      set: { value, updatedAt },
    });
}

export async function getAdminPasswordHash() {
  return readSetting(PASSWORD_KEY);
}

export async function saveAdminPassword(password: string, onlyIfMissing = false) {
  const value = await hashPassword(password);
  if (onlyIfMissing) {
    const inserted = await getDb().insert(adminSettings).values({ key: PASSWORD_KEY, value })
      .onConflictDoNothing().returning({ key: adminSettings.key });
    if (!inserted.length) throw new AppError("Admin paroli allaqachon yaratilgan.", 409);
  } else {
    await writeSetting(PASSWORD_KEY, value);
  }
}

export async function verifySetupKey(value: unknown) {
  const expected = process.env.ADMIN_SETUP_KEY;
  if (!expected || expected.length < 32) throw new AppError("Birinchi parol uchun Vercel’da ADMIN_SETUP_KEY sozlang (kamida 32 belgi).", 503);
  if (typeof value !== "string" || value.length > 256) return false;
  const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
  return constantTimeEquals(await digest(value), await digest(expected));
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function derivePasswordDigest(password: string, salt: Uint8Array) {
  const saltText = encodeBase64Url(salt);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`${sessionSecret()}:${saltText}:${password}`)));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 600_000;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256));
  return `pbkdf2$${iterations}$${encodeBase64Url(salt)}$${encodeBase64Url(derived)}`;
}

function constantTimeEquals(left: Uint8Array, right: Uint8Array) {
  let result = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) result |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return result === 0;
}

export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split("$");
  if (parts.length === 3 && parts[0] === "sha256") {
    try {
      const derived = await derivePasswordDigest(password, decodeBase64Url(parts[1]));
      return constantTimeEquals(derived, decodeBase64Url(parts[2]));
    } catch {
      return false;
    }
  }
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 50_000 || iterations > 1_000_000) return false;
  try {
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: decodeBase64Url(parts[2]) as unknown as BufferSource, iterations, hash: "SHA-256" }, key, 256));
    return constantTimeEquals(derived, decodeBase64Url(parts[3]));
  } catch {
    return false;
  }
}

function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith("replace-with")) throw new AppError("ADMIN_SESSION_SECRET sozlanmagan yoki juda qisqa.", 503, "ADMIN_NOT_CONFIGURED");
  return secret;
}

async function passwordVersion(passwordHash: string) {
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(passwordHash))));
}

async function signSession(payload: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(sessionSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encodeBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

export async function createAdminSession(user: ChatGPTUser) {
  const passwordHash = await getAdminPasswordHash();
  if (!passwordHash) throw new AppError("Admin paroli hali yaratilmagan.", 401);
  const payload = encodeBase64Url(encoder.encode(JSON.stringify({
    userId: user.userId,
    email: user.email.toLowerCase(),
    expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
    passwordVersion: await passwordVersion(passwordHash),
  })));
  return `${payload}.${await signSession(payload)}`;
}

export function adminSessionCookie(value: string) {
  return `${SESSION_COOKIE_NAME}=${value}; Max-Age=${SESSION_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function clearAdminSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(cookieHeader: string | null, name: string) {
  const entry = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : null;
}

export async function getAdminSession(source?: { get(name: string): string | null }) {
  const requestHeaders = source ?? await headers();
  const value = readCookie(requestHeaders.get("cookie"), SESSION_COOKIE_NAME);
  if (!value) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  let parsed: AdminSession;
  try {
    const expected = decodeBase64Url(await signSession(payload));
    const actual = decodeBase64Url(signature);
    if (!constantTimeEquals(actual, expected)) return null;
    parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as AdminSession;
    if (typeof parsed.userId !== "string" || typeof parsed.email !== "string" || !Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= Date.now() || typeof parsed.passwordVersion !== "string") return null;
  } catch {
    return null;
  }
  const stored = await getAdminPasswordHash();
  if (!stored || parsed.passwordVersion !== await passwordVersion(stored)) return null;
  return parsed;
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const raw = await readSetting(SITE_SETTINGS_KEY);
  if (!raw) return defaultSiteSettings;
  try {
    return normalizeSiteSettings(JSON.parse(raw));
  } catch {
    throw new AppError("Sayt sozlamalari buzilgan. Admin orqali qayta saqlang.", 503, "SITE_SETTINGS_INVALID");
  }
}

export async function saveSiteSettings(input: unknown) {
  const settings = normalizeSiteSettings(input);
  await writeSetting(SITE_SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

async function encryptionKey() {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(sessionSecret())));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(value));
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(encrypted))}`;
}

async function decryptSecret(value: string) {
  const [version, ivText, dataText] = value.split(".");
  if (version !== "v1" || !ivText || !dataText) return null;
  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64Url(ivText) }, await encryptionKey(), decodeBase64Url(dataText));
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function getTelegramConfig(): Promise<TelegramConfig> {
  const stored = await readSetting(TELEGRAM_SETTINGS_KEY);
  if (stored) {
    const decrypted = await decryptSecret(stored);
    if (decrypted) {
      try {
        const parsed = JSON.parse(decrypted) as Partial<TelegramConfig>;
        if (typeof parsed.botToken === "string" && typeof parsed.chatId === "string") return { botToken: parsed.botToken, chatId: parsed.chatId };
      } catch {
        // Fall back to environment settings below.
      }
    }
  }
  return { botToken: process.env.TELEGRAM_BOT_TOKEN ?? "", chatId: process.env.TELEGRAM_CHAT_ID ?? "" };
}

export async function saveTelegramConfig(config: TelegramConfig) {
  // Store an explicit empty configuration on disconnect; do not reactivate env credentials.
  await writeSetting(TELEGRAM_SETTINGS_KEY, await encryptSecret(JSON.stringify(config)));
}

export async function sendTelegramMessage(text: string) {
  try {
    const config = await getTelegramConfig();
    if (!config.botToken || !config.chatId) return { ok: false, error: "Telegram bot hali ulanmagan." };
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: true }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
    if (!response.ok || payload?.ok !== true) return { ok: false, error: "Telegram xabar yuborilmadi. Bot tokeni, Chat ID va botga /start yuborilganini tekshiring." };
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: "Telegram serveriga ulanib bo‘lmadi." };
  }
}
