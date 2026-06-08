import "dotenv/config";
import { defineConfig } from "prisma/config";

function getDatabaseUrlFromEnv(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DB;
  const port = process.env.MYSQL_PORT ?? "3306";
  const sslEnabled = process.env.MYSQL_SSL === "true";

  if (!host || !user || !password || !database) {
    // `prisma generate` can run without DB access (e.g. Docker npm postinstall).
    // Provide a safe fallback URL when DB env vars are not present at build time.
    return "mysql://root:root@127.0.0.1:3306/app";
  }

  const ssl = sslEnabled ? "?sslaccept=accept_invalid_certs" : "";
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}${ssl}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getDatabaseUrlFromEnv(),
  },
});
