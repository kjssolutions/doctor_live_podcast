import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/lib/env";

// Both the adapter AND the client must live on globalThis.
// Next.js/Turbopack re-evaluates modules on every HMR reload.
// Without caching the adapter, each reload creates a fresh PrismaMariaDb pool
// (10 connections) that is never closed → MySQL hits max_connections (1040).
const g = globalThis as unknown as {
  prismaAdapter?: PrismaMariaDb;
  prismaClient?: PrismaClient;
};

if (!g.prismaAdapter) {
  g.prismaAdapter = new PrismaMariaDb(getDatabaseUrl());
}

if (!g.prismaClient) {
  g.prismaClient = new PrismaClient({
    adapter: g.prismaAdapter,
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });
}

export const prisma = g.prismaClient;
