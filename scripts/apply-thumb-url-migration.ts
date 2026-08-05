/**
 * Adds doctor_table.thumb_url for generated podcast thumbnails.
 * Run: npx tsx scripts/apply-thumb-url-migration.ts
 */
import "dotenv/config";

import * as mariadb from "mariadb";

import { columnExists } from "./doctor-schema-utils";
import { getMariaDbConfig } from "./mariadb-config";

async function main() {
  const conn = await mariadb.createConnection(getMariaDbConfig());

  try {
    if (!(await columnExists(conn, "doctor_table", "thumb_url"))) {
      await conn.query(
        `ALTER TABLE doctor_table ADD COLUMN \`thumb_url\` TEXT NULL AFTER \`image_url\``,
      );
      console.log("  ✓ doctor_table.thumb_url");
    } else {
      console.log("  skip doctor_table.thumb_url (exists)");
    }
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
