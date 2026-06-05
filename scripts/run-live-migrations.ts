/**
 * Applies all schema migrations to the database in .env (use live credentials).
 * Run: npm run db:migrate-live
 */
import "dotenv/config";

import { execSync } from "node:child_process";

const MIGRATIONS = [
  "scripts/migrate-live-doctor-schema.ts",
  "scripts/apply-asset-storage-url-migration.ts",
  "scripts/apply-row-number-and-doctor-fields-migration.ts",
  "scripts/fix-storage-urls-and-rename-number.ts",
  "scripts/apply-asset-kind-edited-storage-url.ts",
  "scripts/reorder-answer-recording-columns.ts",
] as const;

function shouldRetry(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("ENOTFOUND") ||
    message.includes("ER_CONNECTION_TIMEOUT") ||
    message.includes("08S01")
  );
}

function runWithRetry(script: string) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      execSync(`npx tsx ${script}`, { stdio: "inherit", env: process.env });
      return;
    } catch (error) {
      if (attempt >= maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      const waitMs = attempt * 3000;
      console.log(
        `\nTransient network error. Retrying ${script} in ${waitMs / 1000}s (${attempt}/${maxAttempts})...`,
      );
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
    }
  }
}

function main() {
  const host = process.env.MYSQL_HOST ?? "localhost";
  const db = process.env.MYSQL_DB ?? "";
  const ssl = process.env.MYSQL_SSL === "true" ? " (SSL)" : "";

  console.log(`Target: ${host} / ${db}${ssl}\n`);

  for (const script of MIGRATIONS) {
    console.log(`\n${"=".repeat(60)}\n${script}\n${"=".repeat(60)}`);
    runWithRetry(script);
  }

  console.log("\n✓ All live migrations finished.");
}

main();
