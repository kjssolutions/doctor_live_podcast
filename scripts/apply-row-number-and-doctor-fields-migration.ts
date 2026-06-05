/**
 * Adds row_number + doctor code/name/employee on asset/recording/edited tables.
 * Run: npx tsx scripts/apply-row-number-and-doctor-fields-migration.ts
 */
import "dotenv/config";

import * as mariadb from "mariadb";

import { buildStorageUrl } from "../src/lib/spaces";

import {
  columnExists,
  doctorCodeColumn,
  tableExists,
} from "./doctor-schema-utils";
import { getMariaDbConfig } from "./mariadb-config";

async function countNulls(
  conn: mariadb.Connection,
  table: string,
  column: string,
) {
  const rows = await conn.query<{ cnt: number }[]>(
    `SELECT COUNT(*) AS cnt FROM \`${table}\` WHERE \`${column}\` IS NULL`,
  );
  return Number(rows[0]?.cnt ?? 0);
}

async function addRowNumber(
  conn: mariadb.Connection,
  table: string,
  orderBy: string,
) {
  if (!(await tableExists(conn, table))) {
    console.log(`  skip ${table} (missing)`);
    return;
  }

  if (await columnExists(conn, table, "number")) {
    console.log(`  skip ${table}.number`);
    return;
  }

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

async function ensureAssetDoctorFields(conn: mariadb.Connection) {
  const codeCol = await doctorCodeColumn(conn);
  const hasDoctorId = await columnExists(conn, "asset_table", "doctor_id");
  const needsBackfill =
    !hasDoctorId || (await countNulls(conn, "asset_table", "doctor_code")) > 0;

  if (!needsBackfill) {
    console.log("  skip asset_table doctor fields (already populated)");
    return;
  }

  if (!hasDoctorId) {
    console.log("Adding doctor fields to asset_table...");
    await conn.query(`
      ALTER TABLE asset_table
        ADD COLUMN doctor_id INT NULL,
        ADD COLUMN doctor_code VARCHAR(50) NULL,
        ADD COLUMN doctor_name VARCHAR(255) NULL,
        ADD COLUMN employee_id VARCHAR(30) NULL
    `);
  } else {
    console.log("Backfilling asset_table doctor fields...");
  }

  await conn.query(`
    UPDATE asset_table a
    INNER JOIN answer_recording_table r ON r.asset_id = a.id
    INNER JOIN doctor_table d ON d.id = r.doctor_id
    SET
      a.doctor_id = d.id,
      a.doctor_code = d.\`${codeCol}\`,
      a.doctor_name = d.doctor_name,
      a.employee_id = d.created_by_employee_id
    WHERE a.doctor_code IS NULL OR a.doctor_id IS NULL
  `);

  if (await tableExists(conn, "edited_video_table")) {
    await conn.query(`
      UPDATE asset_table a
      INNER JOIN edited_video_table e ON e.asset_id = a.id
      INNER JOIN doctor_table d ON d.id = e.doctor_id
      SET
        a.doctor_id = d.id,
        a.doctor_code = d.\`${codeCol}\`,
        a.doctor_name = d.doctor_name,
        a.employee_id = d.created_by_employee_id
      WHERE a.doctor_id IS NULL
    `);
  }

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

async function ensureRecordingDoctorFields(conn: mariadb.Connection) {
  if (!(await columnExists(conn, "answer_recording_table", "doctor_code"))) {
    console.log("Adding doctor fields to answer_recording_table...");
    await conn.query(`
      ALTER TABLE answer_recording_table
        ADD COLUMN doctor_code VARCHAR(50) NULL,
        ADD COLUMN doctor_name VARCHAR(255) NULL,
        ADD COLUMN employee_id VARCHAR(30) NULL
    `);
  } else if ((await countNulls(conn, "answer_recording_table", "doctor_code")) === 0) {
    console.log("  skip answer_recording_table doctor fields");
    return;
  } else {
    console.log("Backfilling answer_recording_table doctor fields...");
  }

  const codeCol = await doctorCodeColumn(conn);

  await conn.query(`
    UPDATE answer_recording_table r
    INNER JOIN doctor_table d ON d.id = r.doctor_id
    SET
      r.doctor_code = d.\`${codeCol}\`,
      r.doctor_name = d.doctor_name,
      r.employee_id = d.created_by_employee_id
    WHERE r.doctor_code IS NULL
  `);

  await conn.query(`
    ALTER TABLE answer_recording_table
      MODIFY doctor_code VARCHAR(50) NOT NULL,
      MODIFY doctor_name VARCHAR(255) NULL,
      MODIFY employee_id VARCHAR(30) NULL
  `);
  console.log("  ✓ answer_recording_table doctor fields");
}

async function ensureEditedVideoDoctorFields(conn: mariadb.Connection) {
  if (!(await tableExists(conn, "edited_video_table"))) {
    console.log("  skip edited_video_table (missing)");
    return;
  }

  if (!(await columnExists(conn, "edited_video_table", "doctor_code"))) {
    console.log("Adding doctor fields to edited_video_table...");
    await conn.query(`
      ALTER TABLE edited_video_table
        ADD COLUMN doctor_code VARCHAR(50) NULL,
        ADD COLUMN doctor_name VARCHAR(255) NULL
    `);
  } else if ((await countNulls(conn, "edited_video_table", "doctor_code")) === 0) {
    console.log("  skip edited_video_table doctor fields");
    return;
  } else {
    console.log("Backfilling edited_video_table doctor fields...");
  }

  const codeCol = await doctorCodeColumn(conn);

  await conn.query(`
    UPDATE edited_video_table e
    INNER JOIN doctor_table d ON d.id = e.doctor_id
    SET e.doctor_code = d.\`${codeCol}\`, e.doctor_name = d.doctor_name
    WHERE e.doctor_code IS NULL
  `);

  await conn.query(`
    ALTER TABLE edited_video_table
      MODIFY doctor_code VARCHAR(50) NOT NULL,
      MODIFY doctor_name VARCHAR(255) NULL
  `);
  console.log("  ✓ edited_video_table doctor fields");
}

async function main() {
  const conn = await mariadb.createConnection(
    getMariaDbConfig({ multipleStatements: true }),
  );

  await ensureAssetDoctorFields(conn);
  await ensureRecordingDoctorFields(conn);
  await ensureEditedVideoDoctorFields(conn);

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
