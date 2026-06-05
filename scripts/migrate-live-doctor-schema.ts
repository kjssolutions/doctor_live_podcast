/**
 * Converts live DB (0001_init: varchar doctor id + doctor_code) to local/Prisma format
 * (int autoincrement id + doctor_id code column).
 *
 * Run before other migrations on production. Idempotent when already converted.
 */
import "dotenv/config";

import * as mariadb from "mariadb";

import {
  columnExists,
  doctorCodeColumn,
  dropForeignKeysOnColumn,
  getColumnDataType,
  tableExists,
} from "./doctor-schema-utils";
import { getMariaDbConfig } from "./mariadb-config";

async function ensureDoctorPodcastColumns(conn: mariadb.Connection) {
  const adds: Array<[string, string]> = [
    ["post_production_status", "`post_production_status` ENUM('PROCESSING','DONE','SPOTIFY') NOT NULL DEFAULT 'PROCESSING'"],
    ["spotify_url", "`spotify_url` TEXT NULL"],
    ["podcast_created_at", "`podcast_created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3)"],
    ["podcast_updated_at", "`podcast_updated_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)"],
    ["emp_headquarters", "`emp_headquarters` VARCHAR(255) NULL"],
    ["region", "`region` VARCHAR(100) NULL"],
    ["l1_manager", "`l1_manager` VARCHAR(255) NULL"],
    ["l1_manager_id", "`l1_manager_id` VARCHAR(50) NULL"],
  ];

  for (const [name, def] of adds) {
    if (!(await columnExists(conn, "doctor_table", name))) {
      await conn.query(`ALTER TABLE doctor_table ADD COLUMN ${def}`);
      console.log(`  ✓ doctor_table.${name}`);
    }
  }

  if (
    (await columnExists(conn, "doctor_table", "specialty")) &&
    !(await columnExists(conn, "doctor_table", "speciality"))
  ) {
    await conn.query(
      `ALTER TABLE doctor_table CHANGE COLUMN specialty speciality VARCHAR(255) NULL`,
    );
    console.log("  ✓ doctor_table.specialty → speciality");
  }
}

async function ensureEditedVideoTable(conn: mariadb.Connection) {
  if (await tableExists(conn, "edited_video_table")) {
    return;
  }

  console.log("Creating edited_video_table...");
  const employeeTable = (await tableExists(conn, "tbl_employee"))
    ? "tbl_employee"
    : (await tableExists(conn, "employee_table"))
      ? "employee_table"
      : null;

  await conn.query(`
    CREATE TABLE edited_video_table (
      id VARCHAR(191) NOT NULL,
      doctor_id INT UNSIGNED NOT NULL,
      asset_id VARCHAR(191) NOT NULL,
      created_by_employee_id VARCHAR(30) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX edited_video_table_doctor_id_key(doctor_id),
      INDEX edited_video_table_asset_id_idx(asset_id),
      PRIMARY KEY (id),
      CONSTRAINT ev_doctor_fkey FOREIGN KEY (doctor_id) REFERENCES doctor_table(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT ev_asset_fkey FOREIGN KEY (asset_id) REFERENCES asset_table(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  if (employeeTable) {
    try {
      await conn.query(`
        ALTER TABLE edited_video_table
          ADD CONSTRAINT ev_employee_fkey
          FOREIGN KEY (created_by_employee_id)
          REFERENCES \`${employeeTable}\`(emp_employee_id)
          ON DELETE SET NULL ON UPDATE CASCADE
      `);
    } catch {
      console.log("  (skipped employee FK on edited_video_table)");
    }
  }

  console.log("  ✓ edited_video_table created");
}

async function convertVarcharDoctorIds(conn: mariadb.Connection) {
  const idType = await getColumnDataType(conn, "doctor_table", "id");
  if (idType === "int" || idType === "integer") {
    console.log("✓ doctor_table already uses INT id");
    return;
  }

  console.log("Converting doctor_table id VARCHAR → INT...");

  if (!(await columnExists(conn, "doctor_table", "id_numeric"))) {
    await conn.query(
      `ALTER TABLE doctor_table ADD COLUMN id_numeric INT UNSIGNED NULL`,
    );
    await conn.query(
      `SET @n := 0; UPDATE doctor_table SET id_numeric = (@n := @n + 1) ORDER BY created_at`,
    );
  }

  const recordingDoctorType = await getColumnDataType(
    conn,
    "answer_recording_table",
    "doctor_id",
  );

  if (recordingDoctorType === "varchar") {
    if (!(await columnExists(conn, "answer_recording_table", "doctor_id_new"))) {
      await conn.query(
        `ALTER TABLE answer_recording_table ADD COLUMN doctor_id_new INT UNSIGNED NULL`,
      );
      await conn.query(`
        UPDATE answer_recording_table r
        INNER JOIN doctor_table d ON d.id = r.doctor_id
        SET r.doctor_id_new = d.id_numeric
      `);
    }

    await dropForeignKeysOnColumn(conn, "answer_recording_table", "doctor_id");

    if (await columnExists(conn, "answer_recording_table", "doctor_id")) {
      await conn.query(`ALTER TABLE answer_recording_table DROP COLUMN doctor_id`);
    }

    await conn.query(`
      ALTER TABLE answer_recording_table
        CHANGE COLUMN doctor_id_new doctor_id INT UNSIGNED NOT NULL
    `);
    console.log("  ✓ answer_recording_table.doctor_id → INT");
  }

  await dropForeignKeysOnColumn(conn, "doctor_table", "id");

  // DO managed MySQL often enforces sql_require_primary_key=ON.
  // Swap primary keys atomically so table never exists without a PK.
  await conn.query(`
    ALTER TABLE doctor_table
      DROP PRIMARY KEY,
      CHANGE COLUMN id doctor_id_legacy VARCHAR(191) NOT NULL,
      CHANGE COLUMN id_numeric id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      ADD PRIMARY KEY (id)
  `);

  await conn.query(`ALTER TABLE doctor_table DROP COLUMN doctor_id_legacy`);

  const codeCol = await doctorCodeColumn(conn);
  if (codeCol === "doctor_code") {
    await conn.query(`
      ALTER TABLE doctor_table
        CHANGE COLUMN doctor_code doctor_id VARCHAR(50) NOT NULL
    `);
    console.log("  ✓ doctor_table.doctor_code → doctor_id");
  }

  if (await columnExists(conn, "answer_recording_table", "doctor_id")) {
    await conn.query(`
      ALTER TABLE answer_recording_table
        ADD CONSTRAINT answer_recording_table_doctor_id_fkey
        FOREIGN KEY (doctor_id) REFERENCES doctor_table(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    `);
  }

  console.log("  ✓ doctor_table id is now INT AUTO_INCREMENT");
}

async function main() {
  const conn = await mariadb.createConnection(
    getMariaDbConfig({ multipleStatements: true }),
  );

  await convertVarcharDoctorIds(conn);
  await ensureDoctorPodcastColumns(conn);
  await ensureEditedVideoTable(conn);

  console.log("\nDone (live doctor schema).");
  await conn.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
