import {
  adminSessionCookie,
  clearAdminSessionCookie,
  createAdminSession,
  getAdminPasswordHash,
  getAdminSession,
  requireAdminIdentity,
  saveAdminPassword,
  verifyPassword,
} from "../../../lib/admin";

function clean(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validPassword(password: string) {
  return password.length >= 8 && password.length <= 120;
}

export async function GET(request: Request) {
  const identity = await requireAdminIdentity();
  if (identity.response || !identity.user) return identity.response;
  const passwordHash = await getAdminPasswordHash();
  const session = await getAdminSession(request.headers);
  return Response.json({
    configured: Boolean(passwordHash),
    authenticated: Boolean(session && session.userId === identity.user.userId),
  });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
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
      const password = clean(payload.password, 120);
      if (!validPassword(password)) return Response.json({ error: "Parol kamida 8 ta belgidan iborat bo‘lsin." }, { status: 400 });
      await saveAdminPassword(password);
      const response = Response.json({ success: true });
      response.headers.set("Set-Cookie", adminSessionCookie(await createAdminSession(identity.user)));
      return response;
    }

    if (action === "login") {
      const password = clean(payload.password, 120);
      if (!passwordHash || !(await verifyPassword(password, passwordHash))) return Response.json({ error: "Parol noto‘g‘ri." }, { status: 401 });
      const response = Response.json({ success: true });
      response.headers.set("Set-Cookie", adminSessionCookie(await createAdminSession(identity.user)));
      return response;
    }

    if (action === "change-password") {
      const session = await getAdminSession(request.headers);
      if (!session || session.userId !== identity.user.userId) return Response.json({ error: "Admin sessiyasi tugagan. Qayta kiring." }, { status: 401 });
      const currentPassword = clean(payload.currentPassword, 120);
      const newPassword = clean(payload.newPassword, 120);
      if (!passwordHash || !(await verifyPassword(currentPassword, passwordHash))) return Response.json({ error: "Amaldagi parol noto‘g‘ri." }, { status: 400 });
      if (!validPassword(newPassword)) return Response.json({ error: "Yangi parol kamida 8 ta belgidan iborat bo‘lsin." }, { status: 400 });
      await saveAdminPassword(newPassword);
      const response = Response.json({ success: true });
      response.headers.set("Set-Cookie", adminSessionCookie(await createAdminSession(identity.user)));
      return response;
    }

    return Response.json({ error: "Noma’lum amal." }, { status: 400 });
  } catch {
    return Response.json({ error: "Parolni saqlashda xatolik yuz berdi." }, { status: 500 });
  }
}
