/**
 * Sets public-read ACL on all objects referenced in the DB so CDN URLs work in the browser.
 * Run: npx tsx scripts/make-spaces-objects-public.ts
 */
import "dotenv/config";

import * as mariadb from "mariadb";

import { makeObjectPublic, parseStorageKey } from "../src/lib/spaces";

async function main() {
  const conn = await mariadb.createConnection({
    host: process.env.MYSQL_HOST ?? "localhost",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
  });

  const keys = new Set<string>();

  const assets = await conn.query<{ storage_url: string }[]>(
    `SELECT storage_url FROM asset_table`,
  );
  for (const row of assets) {
    keys.add(parseStorageKey(row.storage_url));
  }

  const doctors = await conn.query<{ image_url: string | null }[]>(
    `SELECT image_url FROM doctor_table WHERE image_url IS NOT NULL`,
  );
  for (const row of doctors) {
    if (row.image_url) {
      keys.add(parseStorageKey(row.image_url));
    }
  }

  await conn.end();

  console.log(`Making ${keys.size} objects public-read...`);

  let ok = 0;
  let failed = 0;

  for (const key of keys) {
    try {
      await makeObjectPublic(key);
      ok++;
      console.log(`  ✓ ${key}`);
    } catch (error) {
      failed++;
      console.error(`  ✗ ${key}`, error);
    }
  }

  console.log(`\nDone: ${ok} ok, ${failed} failed.`);
  if (failed > 0) {
    console.log(
      "If ACL errors occur, enable ACLs on the Space or set a bucket policy for public read.",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
