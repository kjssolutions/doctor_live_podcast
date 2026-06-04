/**
 * 1. Rename row_number -> number (first column)
 * 2. Fix storage_url / image_url to CDN host (.cdn.digitaloceanspaces.com)
 *
 * Run: npx tsx scripts/fix-storage-urls-and-rename-number.ts
 */
import "dotenv/config";

import * as mariadb from "mariadb";

import { buildStorageUrl, fixStorageUrlHost, parseStorageKey } from "../src/lib/spaces";

const TABLES = [
  "question_table",
  "asset_table",
  "answer_recording_table",
  "edited_video_table",
] as const;

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

async function renameRowNumberToNumber(conn: mariadb.Connection, table: string) {
  const hasRowNumber = await columnExists(conn, table, "row_number");
  const hasNumber = await columnExists(conn, table, "number");

  if (hasNumber && !hasRowNumber) {
    console.log(`  skip ${table} (already has number)`);
    return;
  }

  if (!hasRowNumber) {
    console.log(`  skip ${table} (no row_number)`);
    return;
  }

  await conn.query(
    `ALTER TABLE \`${table}\` CHANGE COLUMN \`row_number\` \`number\` INT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE FIRST`,
  );
  console.log(`  ✓ ${table}: row_number → number (first column)`);
}

function fixUrl(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return fixStorageUrlHost(trimmed);
  }

  return buildStorageUrl(trimmed);
}

async function main() {
  const conn = await mariadb.createConnection({
    host: process.env.MYSQL_HOST ?? "localhost",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
  });

  console.log("Renaming row_number → number...");
  for (const table of TABLES) {
    await renameRowNumberToNumber(conn, table);
  }

  console.log("\nFixing asset_table.storage_url to CDN URLs...");
  const assets = await conn.query<{ id: string; storage_url: string }[]>(
    `SELECT id, storage_url FROM asset_table`,
  );

  let assetUpdates = 0;
  for (const row of assets) {
    const fixed = fixUrl(row.storage_url);
    if (fixed && fixed !== row.storage_url) {
      await conn.query(`UPDATE asset_table SET storage_url = ? WHERE id = ?`, [
        fixed,
        row.id,
      ]);
      assetUpdates++;
    }
  }
  console.log(`  ✓ Updated ${assetUpdates} asset URLs`);

  console.log("Fixing doctor_table.image_url...");
  const doctors = await conn.query<{ id: number; image_url: string | null }[]>(
    `SELECT id, image_url FROM doctor_table WHERE image_url IS NOT NULL`,
  );

  let doctorUpdates = 0;
  for (const row of doctors) {
    const fixed = fixUrl(row.image_url);
    if (fixed && fixed !== row.image_url) {
      await conn.query(`UPDATE doctor_table SET image_url = ? WHERE id = ?`, [
        fixed,
        row.id,
      ]);
      doctorUpdates++;
    }
  }
  console.log(`  ✓ Updated ${doctorUpdates} doctor image URLs`);

  if (assets[0]) {
    const sample = fixUrl(assets[0].storage_url) ?? assets[0].storage_url;
    console.log("\nSample CDN URL:", sample);
    console.log("Object key:", parseStorageKey(sample));
  }

  console.log("\nDone. Restart dev server.");
  await conn.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
