/**
 * Drops thumbnail_table and removes THUMBNAIL from asset_kind.
 * Thumbnails are stored only on doctor_table.thumb_url.
 * Run: npx tsx scripts/drop-thumbnail-table.ts
 */
import "dotenv/config";

import * as mariadb from "mariadb";

import { tableExists } from "./doctor-schema-utils";
import { getMariaDbConfig } from "./mariadb-config";

async function main() {
  const conn = await mariadb.createConnection(getMariaDbConfig());

  try {
    if (await tableExists(conn, "thumbnail_table")) {
      // Collect asset ids before drop so we can clean asset_table.
      const rows = await conn.query<{ asset_id: string }[]>(
        `SELECT asset_id FROM thumbnail_table`,
      );
      const assetIds = rows.map((row) => row.asset_id);

      await conn.query(`DROP TABLE thumbnail_table`);
      console.log("  ✓ dropped thumbnail_table");

      if (assetIds.length > 0) {
        const placeholders = assetIds.map(() => "?").join(",");
        await conn.query(
          `DELETE FROM asset_table WHERE id IN (${placeholders}) AND asset_kind = 'THUMBNAIL'`,
          assetIds,
        );
        console.log(`  ✓ removed ${assetIds.length} THUMBNAIL asset row(s)`);
      }
    } else {
      console.log("  skip thumbnail_table (already gone)");
    }

    // Remove any leftover THUMBNAIL assets.
    if (await tableExists(conn, "asset_table")) {
      const result = await conn.query(
        `DELETE FROM asset_table WHERE asset_kind = 'THUMBNAIL'`,
      );
      const affected =
        typeof result === "object" && result && "affectedRows" in result
          ? Number((result as { affectedRows?: number }).affectedRows ?? 0)
          : 0;
      if (affected > 0) {
        console.log(`  ✓ cleaned ${affected} leftover THUMBNAIL asset(s)`);
      }

      const kindRows = await conn.query<{ COLUMN_TYPE: string }[]>(
        `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_table' AND COLUMN_NAME = 'asset_kind'`,
      );
      const columnType = kindRows[0]?.COLUMN_TYPE ?? "";
      if (columnType.includes("THUMBNAIL")) {
        await conn.query(`
          ALTER TABLE asset_table
          MODIFY asset_kind ENUM('INTERVIEW_RECORDING','EDITED_VIDEO','FLYER')
          NOT NULL DEFAULT 'INTERVIEW_RECORDING'
        `);
        console.log("  ✓ asset_kind enum without THUMBNAIL");
      } else {
        console.log("  skip asset_kind (THUMBNAIL already removed)");
      }
    }
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
