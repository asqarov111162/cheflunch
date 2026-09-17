import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

type ChefLunchDatabase = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as typeof globalThis & {
  chefLunchPool?: Pool;
  chefLunchDb?: ChefLunchDatabase;
};

export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL sozlanmagan. Vercel loyihasiga Neon ulanishini ulang.");
  }

  if (!globalForDb.chefLunchDb) {
    globalForDb.chefLunchPool ??= new Pool({ connectionString });
    globalForDb.chefLunchDb = drizzle(globalForDb.chefLunchPool, { schema });
  }

  return globalForDb.chefLunchDb;
}
