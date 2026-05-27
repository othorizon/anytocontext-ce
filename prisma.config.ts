import "dotenv/config";
import { defineConfig } from "prisma/config";
import { getCliDatabaseUrl } from "./lib/db/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // CLI（migrate / studio）首选 DIRECT_URL，缺失时回退 DATABASE_URL
    url: getCliDatabaseUrl(),
  },
});
