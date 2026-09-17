import {
  adminSessionCookie,
  clearAdminSessionCookie,
  createAdminSession,
  getAdminPasswordHash,
  getAdminSession,
  requireAdminIdentity,
  saveAdminPassword,
  verifyPassword,
  verifySetupKey,
} from "../../../lib/admin";
import { errorResponse } from "../../../lib/errors";

function clean(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validPassword(password: string) {
  return password.length >= 8 && password.length <= 120;
}

export async function GET(request: Request) {
  try {
  const identity = await requireAdminIdentity();
  if (identity.response || !identity.user) return identity.response;
  const passwordHash = await getAdminPasswordHash();
  const session = await getAdminSession(request.headers);
  return Response.json({
    configured: Boolean(passwordHash),
    authenticated: Boolean(session && session.userId === identity.user.userId),
  }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, "Admin sozlamalarini yuklab bo‘lmadi."); }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Ruxsat etilmagan so‘rov." }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return Response.json({ error: "Noto‘g‘ri so‘rov." }, { status: 400 });
  const action = clean(payload.action, 30);

  if (action === "logout") {
    const response = Response.json({ success: true });
    response.headers.set("Set-Cookie", clearAdminSessionCookie());
    return response;
  }

  const identity = await requireAdminIdentity();
  if (identity.response || !identity.user) return identity.response;

  try {
    const passwordHash = await getAdminPasswordHash();
    if (action === "setup") {
      if (passwordHash) return Response.json({ error: "Admin paroli allaqachon yaratilgan." }, { status: 409 });
      if (!(await verifySetupKey(payload.setupKey))) return Response.json({ error: "Sozlash kaliti noto‘g‘ri." }, { status: 403 });
      const password = typeof payload.password === "string" ? payload.password : "";
      if (!validPassword(password)) return Response.json({ error: "Parol kamida 8 ta belgidan iborat bo‘lsin." }, { status: 400 });
      await saveAdminPassword(password, true);
      const response = Response.json({ success: true });
      response.headers.set("Set-Cookie", adminSessionCookie(await createAdminSession(identity.user)));
      return response;
    }

    if (action === "login") {
      const password = typeof payload.password === "string" ? payload.password : "";
      if (!validPassword(password)) return Response.json({ error: "Parol noto‘g‘ri." }, { status: 401 });
      if (!passwordHash || !(await verifyPassword(password, passwordHash))) return Response.json({ error: "Parol noto‘g‘ri." }, { status: 401 });
      const response = Response.json({ success: true });
      response.headers.set("Set-Cookie", adminSessionCookie(await createAdminSession(identity.user)));
      return response;
    }

    if (action === "change-password") {
      const session = await getAdminSession(request.headers);
      if (!session || session.userId !== identity.user.userId) return Response.json({ error: "Admin sessiyasi tugagan. Qayta kiring." }, { status: 401 });
      const currentPassword = typeof payload.currentPassword === "string" ? payload.currentPassword : "";
      const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
      if (!validPassword(currentPassword) || !passwordHash || !(await verifyPassword(currentPassword, passwordHash))) return Response.json({ error: "Amaldagi parol noto‘g‘ri." }, { status: 400 });
      if (!validPassword(newPassword)) return Response.json({ error: "Yangi parol kamida 8 ta belgidan iborat bo‘lsin." }, { status: 400 });
      await saveAdminPassword(newPassword);
      const response = Response.json({ success: true });
      response.headers.set("Set-Cookie", adminSessionCookie(await createAdminSession(identity.user)));
      return response;
    }

    return Response.json({ error: "Noma’lum amal." }, { status: 400 });
  } catch (error) {
    return errorResponse(error, "Parol amalini bajarib bo‘lmadi.");
  }
}
