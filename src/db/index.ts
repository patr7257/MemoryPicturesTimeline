// Lazy, memoized Drizzle client over a node-postgres Pool (plain TCP), same
// pattern as PatrickRobelWeb's hub db. TCP rather than the Neon HTTP driver
// because the HTTP path times out from some developer machines, while TCP
// works locally and in the Dokploy container. The Pool does not connect until
// the first query, so the app builds without a DATABASE_URL.
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as appSchema from "./schema";
import * as authSchema from "./auth-schema";

const schema = { ...appSchema, ...authSchema };

export type Db = NodePgDatabase<typeof schema>;

let cached: Db | undefined;

export function getDb(): Db {
  if (!cached) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    cached = drizzle(pool, { schema });
  }
  return cached;
}
