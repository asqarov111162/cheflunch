export class AppError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_REQUEST") {
    super(message);
  }
}

export function publicError(error: unknown, fallback = "So‘rovni bajarib bo‘lmadi.") {
  if (error instanceof AppError) return { error: error.message, code: error.code, status: error.status };
  // Drizzle wraps driver errors; inspect codes, never expose SQL/credentials.
  let cause: unknown = error;
  for (let depth = 0; cause && typeof cause === "object" && depth < 5; depth++) {
    const detail = cause as { code?: string; cause?: unknown };
    if (detail.code === "42P01" || detail.code === "42703") {
      return { error: "Baza jadvallari tayyor emas. DATABASE_URL ni tekshirib, yangi deploy qiling.", code: "DATABASE_SCHEMA_MISSING", status: 503 };
    }
    if (detail.code?.startsWith("08") || ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"].includes(detail.code || "")) {
      return { error: "Bazaga ulanib bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.", code: "DATABASE_UNAVAILABLE", status: 503 };
    }
    cause = detail.cause;
  }
  return { error: fallback, code: "SERVER_ERROR", status: 500 };
}

export function errorResponse(error: unknown, fallback?: string) {
  const { status, ...body } = publicError(error, fallback);
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
