import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import { AppError } from "../app/lib/errors";

export type ChefLunchDatabase = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as typeof globalThis & {
  chefLunchPool?: Pool;
  chefLunchDb?: ChefLunchDatabase;
};

export function getDb() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new AppError("Baza ulanmagan. Vercel sozlamalarida DATABASE_URL ni kiriting va yangi deploy qiling.", 503, "DATABASE_NOT_CONFIGURED");
  }

  if (!globalForDb.chefLunchDb) {
    // Reuse only the pool wrapper, never a WebSocket client across requests.
    // A transaction owns its client until commit/rollback; release then closes it.
    if (!globalForDb.chefLunchPool) {
      globalForDb.chefLunchPool = new Pool({ connectionString, max: 3, maxUses: 1, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 5_000 });
      globalForDb.chefLunchPool.on("error", () => console.error("[CHEF LUNCH] Baza ulanishi uzildi."));
    }
    globalForDb.chefLunchDb = drizzle(globalForDb.chefLunchPool, { schema });
  }

  return globalForDb.chefLunchDb;
}
