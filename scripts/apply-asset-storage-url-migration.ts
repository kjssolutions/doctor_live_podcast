/**
 * Applies asset_table storage_url migration when DB was created via db:setup-local.
 * Run: npx tsx scripts/apply-asset-storage-url-migration.ts
 */
import "dotenv/config";

import * as mariadb from "mariadb";

async function columnExists(
  conn: mariadb.Connection,
  column: string,
) {
  const rows = await conn.query<{ COLUMN_NAME: string }[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'asset_table' AND COLUMN_NAME = ?`,
    [process.env.MYSQL_DB, column],
  );
  return rows.length > 0;
}

async function main() {
  const conn = await mariadb.createConnection({
    host: process.env.MYSQL_HOST ?? "localhost",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
  });

  if (await columnExists(conn, "storage_url")) {
    console.log("✓ asset_table.storage_url already exists — skipping");
    await conn.end();
    return;
  }

  if (!(await columnExists(conn, "key"))) {
    console.log("✓ asset_table already uses storage_url schema");
    await conn.end();
    return;
  }

  console.log("Migrating asset_table to storage_url...");

  await conn.query(
    `ALTER TABLE asset_table ADD COLUMN storage_url VARCHAR(1024) NULL`,
  );

  await conn.query(`
    UPDATE asset_table
    SET storage_url = CONCAT(
      'https://',
      bucket,
      '.',
      TRIM(TRAILING '/' FROM REPLACE(REPLACE(COALESCE(endpoint, ''), 'https://', ''), 'http://', '')),
      '/',
      \`key\`
    )
    WHERE storage_url IS NULL AND endpoint IS NOT NULL AND endpoint != ''
  `);

  await conn.query(`
    UPDATE asset_table SET storage_url = \`key\` WHERE storage_url IS NULL
  `);

  await conn.query(
    `ALTER TABLE asset_table MODIFY storage_url VARCHAR(1024) NOT NULL`,
  );

  try {
    await conn.query(`DROP INDEX asset_table_key_key ON asset_table`);
  } catch {
    // index name may differ
  }

  await conn.query(`
    ALTER TABLE asset_table
      DROP COLUMN \`key\`,
      DROP COLUMN bucket,
      DROP COLUMN endpoint
  `);

  try {
    await conn.query(
      `CREATE UNIQUE INDEX asset_table_storage_url_key ON asset_table(storage_url)`,
    );
  } catch {
    console.log("  (unique index may already exist)");
  }

  console.log("✓ asset_table migration complete");

  const doctors = await conn.query<
    { id: number; image_url: string | null }[]
  >(
    `SELECT id, image_url FROM doctor_table
     WHERE image_url IS NOT NULL
       AND image_url NOT LIKE 'http%'`,
  );

  if (doctors.length > 0) {
    const { buildStorageUrl } = await import("../src/lib/spaces");
    for (const row of doctors) {
      if (!row.image_url) continue;
      const storageUrl = buildStorageUrl(row.image_url);
      await conn.query(`UPDATE doctor_table SET image_url = ? WHERE id = ?`, [
        storageUrl,
        row.id,
      ]);
    }
    console.log(`✓ Updated ${doctors.length} doctor image_url to full URLs`);
  }

  await conn.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
