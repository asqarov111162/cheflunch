import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import nextEnv from "@next/env";
import { setupDatabase } from "./setup-db.mjs";

nextEnv.loadEnvConfig(process.cwd());
// Parse the real file, not a truncated terminal representation of it.
JSON.parse(readFileSync("package-lock.json", "utf8"));

if (process.env.DATABASE_URL?.trim()) {
  try { await setupDatabase(); }
  catch {
    console.error("[CHEF LUNCH] DATABASE_URL bor, lekin PostgreSQL jadvallarini tayyorlab bo‘lmadi. Ulanish manzili va bazaga ruxsatni tekshiring.");
    process.exit(1);
  }
} else {
  console.warn("[CHEF LUNCH] DATABASE_URL yo‘q: sayt quriladi, ammo menyu, admin va buyurtmalar baza ulanmaguncha ishlamaydi.");
}

const build = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { stdio: "inherit" });
if (build.error || build.status !== 0) process.exit(build.status || 1);
JSON.parse(readFileSync(".next/routes-manifest.json", "utf8"));
console.log("[CHEF LUNCH] Next.js build va routes-manifest tekshirildi.");
