/**
 * Adds row_number + doctor code/name/employee on asset/recording/edited tables.
 * Run: npx tsx scripts/apply-row-number-and-doctor-fields-migration.ts
 */
import "dotenv/config";

import * as mariadb from "mariadb";

import { buildStorageUrl } from "../src/lib/spaces";

async function columnExists(conn: mariadb.Connection, table: string, column: string) {
  const rows = await conn.query<{ cnt: number }[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [process.env.MYSQL_DB, table, column],
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function addRowNumber(
  conn: mariadb.Connection,
  table: string,
  orderBy: string,
) {
  if (await columnExists(conn, table, "row_number")) {
    console.log(`  skip ${table}.row_number`);
    return;
  }

  await conn.query(
    `ALTER TABLE \`${table}\` ADD COLUMN \`row_number\` INT UNSIGNED NULL`,
  );
  await conn.query(
    `SET @n := 0; UPDATE \`${table}\` SET \`row_number\` = (@n := @n + 1) ORDER BY ${orderBy}`,
  );
  await conn.query(
    `ALTER TABLE \`${table}\` MODIFY \`row_number\` INT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE`,
  );
  console.log(`  ✓ ${table}.row_number`);
}

async function main() {
  const conn = await mariadb.createConnection({
    host: process.env.MYSQL_HOST ?? "localhost",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
    multipleStatements: true,
  });

  if (!(await columnExists(conn, "asset_table", "doctor_id"))) {
    console.log("Adding doctor fields to asset_table...");
    await conn.query(`
      ALTER TABLE asset_table
        ADD COLUMN doctor_id INT NULL,
        ADD COLUMN doctor_code VARCHAR(50) NULL,
        ADD COLUMN doctor_name VARCHAR(255) NULL,
        ADD COLUMN employee_id VARCHAR(30) NULL
    `);

    await conn.query(`
      UPDATE asset_table a
      INNER JOIN answer_recording_table r ON r.asset_id = a.id
      INNER JOIN doctor_table d ON d.id = r.doctor_id
      SET
        a.doctor_id = d.id,
        a.doctor_code = d.doctor_id,
        a.doctor_name = d.doctor_name,
        a.employee_id = d.created_by_employee_id
    `);

    await conn.query(`
      UPDATE asset_table a
      INNER JOIN edited_video_table e ON e.asset_id = a.id
      INNER JOIN doctor_table d ON d.id = e.doctor_id
      SET
        a.doctor_id = d.id,
        a.doctor_code = d.doctor_id,
        a.doctor_name = d.doctor_name,
        a.employee_id = d.created_by_employee_id
      WHERE a.doctor_id IS NULL
    `);

    await conn.query(`
      ALTER TABLE asset_table
        MODIFY doctor_id INT NOT NULL,
        MODIFY doctor_code VARCHAR(50) NOT NULL,
        MODIFY doctor_name VARCHAR(255) NULL,
        MODIFY employee_id VARCHAR(30) NULL
    `);

    try {
      await conn.query(`CREATE INDEX asset_table_doctor_id_idx ON asset_table(doctor_id)`);
      await conn.query(
        `CREATE INDEX asset_table_doctor_code_idx ON asset_table(doctor_code)`,
      );
      await conn.query(
        `CREATE INDEX asset_table_employee_id_idx ON asset_table(employee_id)`,
      );
    } catch {
      // indexes may exist
    }
    console.log("  ✓ asset_table doctor fields");
  }

  if (!(await columnExists(conn, "answer_recording_table", "doctor_code"))) {
    console.log("Adding doctor fields to answer_recording_table...");
    await conn.query(`
      ALTER TABLE answer_recording_table
        ADD COLUMN doctor_code VARCHAR(50) NULL,
        ADD COLUMN doctor_name VARCHAR(255) NULL,
        ADD COLUMN employee_id VARCHAR(30) NULL
    `);
    await conn.query(`
      UPDATE answer_recording_table r
      INNER JOIN doctor_table d ON d.id = r.doctor_id
      SET
        r.doctor_code = d.doctor_id,
        r.doctor_name = d.doctor_name,
        r.employee_id = d.created_by_employee_id
    `);
    await conn.query(`
      ALTER TABLE answer_recording_table
        MODIFY doctor_code VARCHAR(50) NOT NULL,
        MODIFY doctor_name VARCHAR(255) NULL,
        MODIFY employee_id VARCHAR(30) NULL
    `);
    console.log("  ✓ answer_recording_table doctor fields");
  }

  if (!(await columnExists(conn, "edited_video_table", "doctor_code"))) {
    console.log("Adding doctor fields to edited_video_table...");
    await conn.query(`
      ALTER TABLE edited_video_table
        ADD COLUMN doctor_code VARCHAR(50) NULL,
        ADD COLUMN doctor_name VARCHAR(255) NULL
    `);
    await conn.query(`
      UPDATE edited_video_table e
      INNER JOIN doctor_table d ON d.id = e.doctor_id
      SET e.doctor_code = d.doctor_id, e.doctor_name = d.doctor_name
    `);
    await conn.query(`
      ALTER TABLE edited_video_table
        MODIFY doctor_code VARCHAR(50) NOT NULL,
        MODIFY doctor_name VARCHAR(255) NULL
    `);
    console.log("  ✓ edited_video_table doctor fields");
  }

  await addRowNumber(conn, "question_table", "`order`, created_at");
  await addRowNumber(conn, "asset_table", "created_at");
  await addRowNumber(conn, "answer_recording_table", "created_at");
  await addRowNumber(conn, "edited_video_table", "created_at");

  const doctors = await conn.query<{ id: number; image_url: string | null }[]>(
    `SELECT id, image_url FROM doctor_table
     WHERE image_url IS NOT NULL AND image_url NOT LIKE 'http%'`,
  );

  for (const row of doctors) {
    if (!row.image_url) continue;
    await conn.query(`UPDATE doctor_table SET image_url = ? WHERE id = ?`, [
      buildStorageUrl(row.image_url),
      row.id,
    ]);
  }

  if (doctors.length > 0) {
    console.log(`✓ Normalized ${doctors.length} doctor image_url to full URLs`);
  }

  console.log("Done.");
  await conn.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
