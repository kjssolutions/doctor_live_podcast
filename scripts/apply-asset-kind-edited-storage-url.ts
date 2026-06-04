/**
 * Adds asset_kind, edited_video.storage_url, backfills data.
 * Run: npx tsx scripts/apply-asset-kind-edited-storage-url.ts
 */
import "dotenv/config";

import * as mariadb from "mariadb";

async function columnExists(
  conn: mariadb.Connection,
  table: string,
  column: string,
) {
  const rows = await conn.query<{ cnt: number }[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [process.env.MYSQL_DB, table, column],
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function main() {
  const conn = await mariadb.createConnection({
    host: process.env.MYSQL_HOST ?? "localhost",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
  });

  if (!(await columnExists(conn, "asset_table", "asset_kind"))) {
    await conn.query(`
      ALTER TABLE asset_table
        ADD COLUMN asset_kind ENUM('INTERVIEW_RECORDING','EDITED_VIDEO')
        NOT NULL DEFAULT 'INTERVIEW_RECORDING' AFTER employee_id
    `);
    console.log("  ✓ asset_table.asset_kind added");
  }

  await conn.query(`
    UPDATE asset_table a
    INNER JOIN edited_video_table e ON e.asset_id = a.id
    SET a.asset_kind = 'EDITED_VIDEO'
  `);

  await conn.query(`
    UPDATE asset_table SET asset_kind = 'INTERVIEW_RECORDING'
    WHERE asset_kind IS NULL OR asset_kind = ''
  `);

  try {
    await conn.query(`CREATE INDEX asset_table_asset_kind_idx ON asset_table(asset_kind)`);
  } catch {
    // exists
  }

  console.log("  ✓ asset_kind backfilled");

  if (!(await columnExists(conn, "edited_video_table", "storage_url"))) {
    await conn.query(`
      ALTER TABLE edited_video_table
        ADD COLUMN storage_url VARCHAR(1024) NULL AFTER created_by_employee_id
    `);
    console.log("  ✓ edited_video_table.storage_url added");
  }

  await conn.query(`
    UPDATE edited_video_table e
    INNER JOIN asset_table a ON a.id = e.asset_id
    SET e.storage_url = a.storage_url
    WHERE e.storage_url IS NULL OR e.storage_url = ''
  `);

  await conn.query(`
    ALTER TABLE edited_video_table
      MODIFY storage_url VARCHAR(1024) NOT NULL
  `);

  console.log("  ✓ edited_video storage_url backfilled from assets");

  await conn.end();
  console.log("\nDone. Run: npx prisma generate — then restart dev server.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
