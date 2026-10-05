import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/lib/env";

// Both the adapter AND the client must live on globalThis.
// Next.js/Turbopack re-evaluates modules on every HMR reload.
// Without caching the adapter, each reload creates a fresh PrismaMariaDb pool
// that is never closed → MySQL hits max_connections (1040).
/** Bump when Prisma schema changes so dev HMR does not keep an old client (e.g. asset.key). */
const PRISMA_CLIENT_CACHE_KEY = "prisma-client-v10-created-rejected-status";

const g = globalThis as unknown as {
  prismaAdapter?: PrismaMariaDb;
  prismaClient?: PrismaClient;
  prismaClientCacheKey?: string;
};

const DB_CONNECTION_LIMIT = "20";

function getPoolDatabaseUrl() {
  const url = new URL(getDatabaseUrl());
  if (!url.searchParams.has("connectionLimit")) {
    url.searchParams.set("connectionLimit", DB_CONNECTION_LIMIT);
  }
  return url.toString();
}

if (!g.prismaAdapter) {
  g.prismaAdapter = new PrismaMariaDb(getPoolDatabaseUrl());
}

if (!g.prismaClient || g.prismaClientCacheKey !== PRISMA_CLIENT_CACHE_KEY) {
  g.prismaClient = new PrismaClient({
    adapter: g.prismaAdapter,
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });
  g.prismaClientCacheKey = PRISMA_CLIENT_CACHE_KEY;
}

export const prisma = g.prismaClient;
