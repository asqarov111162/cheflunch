import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../../db";
import { adminSettings } from "../../db/schema";
import { getChatGPTUser, type ChatGPTUser } from "../chatgpt-auth";
import { defaultSiteSettings, normalizeSiteSettings, type SiteSettings } from "./site-settings";

const PASSWORD_KEY = "admin_password_hash";
const SITE_SETTINGS_KEY = "site_settings";
const TELEGRAM_SETTINGS_KEY = "telegram_settings";
const SESSION_COOKIE_NAME = "chef_lunch_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 120_000;
const FALLBACK_SESSION_SECRET = "chef-lunch-local-session-secret";
const encoder = new TextEncoder();

export type AdminSession = {
  userId: string;
  email: string;
  expiresAt: number;
};

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

function allowedEmails() {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function adminIsConfigured() {
  return allowedEmails().length > 0;
}

export async function getAdminUser(): Promise<ChatGPTUser | null> {
  const user = await getChatGPTUser();
  if (!user) return null;
  const emails = allowedEmails();
  if (!emails.length || !emails.includes(user.email.toLowerCase())) return null;
  return user;
}

export async function requireAdminIdentity() {
  if (!adminIsConfigured()) {
    return { user: null, response: Response.json({ error: "Admin kirishi hali sozlanmagan." }, { status: 503 }) };
  }
  const user = await getChatGPTUser();
  if (!user) {
    return { user: null, response: Response.json({ error: "ChatGPT hisobiga kirish kerak." }, { status: 401 }) };
  }
  if (!allowedEmails().includes(user.email.toLowerCase())) {
    return { user: null, response: Response.json({ error: "Admin huquqi kerak." }, { status: 403 }) };
  }
  return { user, response: null };
}

export async function requireAdminApi(request?: Request) {
  const identity = await requireAdminIdentity();
  if (identity.response || !identity.user) return identity;
  const session = await getAdminSession(request?.headers);
  if (!session || session.userId !== identity.user.userId || session.email.toLowerCase() !== identity.user.email.toLowerCase()) {
    return { user: null, response: Response.json({ error: "Admin paroli bilan kirish kerak." }, { status: 401 }) };
  }
  return identity;
}

async function readSetting(key: string) {
  try {
    const db = getDb();
    const [row] = await db
      .select({ value: adminSettings.value })
      .from(adminSettings)
      .where(eq(adminSettings.key, key))
      .limit(1);
    return row?.value ?? null;
  } catch {
    return null;
  }
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

async function removeSetting(key: string) {
  const db = getDb();
  await db.delete(adminSettings).where(eq(adminSettings.key, key));
}

export async function getAdminPasswordHash() {
  return readSetting(PASSWORD_KEY);
}

export async function saveAdminPassword(password: string) {
  await writeSetting(PASSWORD_KEY, await hashPassword(password));
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
  const derived = await derivePasswordDigest(password, salt);
  return `sha256$${encodeBase64Url(salt)}$${encodeBase64Url(derived)}`;
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
  if (!Number.isInteger(iterations) || iterations < 50_000 || iterations > 500_000) return false;
  try {
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: decodeBase64Url(parts[2]) as unknown as BufferSource, iterations, hash: "SHA-256" }, key, 256));
    return constantTimeEquals(derived, decodeBase64Url(parts[3]));
  } catch {
    return false;
  }
}

function sessionSecret() {
  return env.ADMIN_SESSION_SECRET || FALLBACK_SESSION_SECRET;
}

async function signSession(payload: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(sessionSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encodeBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

export async function createAdminSession(user: ChatGPTUser) {
  const payload = encodeBase64Url(encoder.encode(JSON.stringify({
    userId: user.userId,
    email: user.email.toLowerCase(),
    expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
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
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  try {
    const expected = decodeBase64Url(await signSession(payload));
    const actual = decodeBase64Url(signature);
    if (!constantTimeEquals(actual, expected)) return null;
    const parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as AdminSession;
    if (!parsed.userId || !parsed.email || !parsed.expiresAt || parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const raw = await readSetting(SITE_SETTINGS_KEY);
  if (!raw) return defaultSiteSettings;
  try {
    return normalizeSiteSettings(JSON.parse(raw));
  } catch {
    return defaultSiteSettings;
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
  return { botToken: env.TELEGRAM_BOT_TOKEN ?? "", chatId: env.TELEGRAM_CHAT_ID ?? "" };
}

export async function saveTelegramConfig(config: TelegramConfig) {
  if (!config.botToken || !config.chatId) {
    await removeSetting(TELEGRAM_SETTINGS_KEY);
    return;
  }
  await writeSetting(TELEGRAM_SETTINGS_KEY, await encryptSecret(JSON.stringify(config)));
}

export async function sendTelegramMessage(text: string) {
  const config = await getTelegramConfig();
  if (!config.botToken || !config.chatId) return { ok: false, error: "Telegram bot hali ulanmagan." };
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: true }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
    if (!response.ok || payload?.ok === false) return { ok: false, error: payload?.description || "Telegram xabar yuborilmadi." };
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: "Telegram serveriga ulanib bo‘lmadi." };
  }
}
