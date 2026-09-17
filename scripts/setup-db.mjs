import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";

// Safe, repeatable provisioning: never drop tables or overwrite existing rows.
// Keep these six statements aligned with db/schema.ts. Future schema changes
// require reviewed migrations; db:push is deliberately not run on every build.
export async function initializationStatements() {
  const sql = await readFile(new URL("../drizzle/0000_free_purifiers.sql", import.meta.url), "utf8");
  return sql.split("--> statement-breakpoint")
    .map((statement) => statement.trim().replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS "))
    .filter(Boolean);
}

/** @param {{ DATABASE_URL?: string }} env */
export function databaseUrl(env = process.env) {
  const value = env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL yo‘q. Vercel → Settings → Environment Variables orqali Neon bazasini ulang.");
  let url;
  try { url = new URL(value); } catch { /* The message must never contain credentials. */ }
  if (!url || !["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
    throw new Error("DATABASE_URL noto‘g‘ri. Neon Connect bo‘limidagi PostgreSQL connection stringni kiriting.");
  }
  return value;
}

export async function setupDatabase() {
  const sql = neon(databaseUrl());
  const statements = await initializationStatements();
  // Serialize concurrent deployments so initial catalog creation cannot race.
  await sql.transaction([
    sql.query("SELECT pg_advisory_xact_lock(20260917, 1)"),
    ...statements.map((statement) => sql.query(statement)),
  ]);
  console.log("[CHEF LUNCH] PostgreSQL jadvallari tayyor. Mavjud ma’lumotlar saqlandi.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  nextEnv.loadEnvConfig(process.cwd());
  try { await setupDatabase(); }
  catch {
    console.error("[CHEF LUNCH] Baza sozlanmadi. DATABASE_URL va Neon ulanishini tekshiring. Maxfiy qiymatlarni logga yubormang.");
    process.exitCode = 1;
  }
}
