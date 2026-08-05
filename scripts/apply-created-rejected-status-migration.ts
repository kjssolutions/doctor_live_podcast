/**
 * Extends doctor_table.post_production_status with CREATED + REJECTED.
 * Run: npx tsx scripts/apply-created-rejected-status-migration.ts
 */
import "dotenv/config";

import * as mariadb from "mariadb";

import { getMariaDbConfig } from "./mariadb-config";

async function main() {
  const conn = await mariadb.createConnection(getMariaDbConfig());

  try {
    await conn.query(`
      ALTER TABLE doctor_table
      MODIFY COLUMN post_production_status
        ENUM('CREATED','PROCESSING','DONE','SPOTIFY','REJECTED')
        NOT NULL DEFAULT 'CREATED'
    `);
    console.log("  ✓ doctor_table.post_production_status includes CREATED, REJECTED");
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
