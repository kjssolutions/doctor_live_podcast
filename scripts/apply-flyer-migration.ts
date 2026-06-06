/**
 * Adds FLYER asset kind and flyer_table for podcast flyers.
 * Run: npx tsx scripts/apply-flyer-migration.ts
 */
import "dotenv/config";

import * as mariadb from "mariadb";

import { columnExists, tableExists } from "./doctor-schema-utils";
import { getMariaDbConfig } from "./mariadb-config";

async function main() {
  const conn = await mariadb.createConnection(getMariaDbConfig());

  try {
    if (await tableExists(conn, "asset_table")) {
      const rows = await conn.query<{ COLUMN_TYPE: string }[]>(
        `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_table' AND COLUMN_NAME = 'asset_kind'`,
      );
      const columnType = rows[0]?.COLUMN_TYPE ?? "";
      if (!columnType.includes("FLYER")) {
        await conn.query(`
          ALTER TABLE asset_table
          MODIFY asset_kind ENUM('INTERVIEW_RECORDING','EDITED_VIDEO','FLYER')
          NOT NULL DEFAULT 'INTERVIEW_RECORDING'
        `);
        console.log("  ✓ asset_table.asset_kind extended with FLYER");
      } else {
        console.log("  skip asset_kind (FLYER already present)");
      }
    }

    if (await tableExists(conn, "flyer_table")) {
      console.log("  skip flyer_table (exists)");
      return;
    }

    console.log("Creating flyer_table...");
    await conn.query(`
      CREATE TABLE flyer_table (
        \`number\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        id VARCHAR(191) NOT NULL,
        doctor_id INT NOT NULL,
        doctor_code VARCHAR(50) NOT NULL,
        doctor_name VARCHAR(255) NULL,
        asset_id VARCHAR(191) NOT NULL,
        spotify_url TEXT NOT NULL,
        storage_url VARCHAR(1024) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE INDEX flyer_table_number_key(\`number\`),
        UNIQUE INDEX flyer_table_doctor_id_key(doctor_id),
        INDEX flyer_table_asset_id_idx(asset_id),
        PRIMARY KEY (id),
        CONSTRAINT flyer_doctor_fkey FOREIGN KEY (doctor_id) REFERENCES doctor_table(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT flyer_asset_fkey FOREIGN KEY (asset_id) REFERENCES asset_table(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("  ✓ flyer_table created");
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
