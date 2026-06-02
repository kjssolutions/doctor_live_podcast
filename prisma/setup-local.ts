/**
 * Local MySQL setup:
 * 1. Creates database from MYSQL_DB if it does not exist
 * 2. Fresh DB (doctor_live_podcast): creates all tables
 * 3. Legacy DB (ai_old_young): adds podcast columns to existing doctor_table
 *
 * Run: npm run db:setup-local
 */
import "dotenv/config";

import { execSync } from "node:child_process";

import * as mariadb from "mariadb";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in .env`);
  }
  return value;
}

async function ensureDatabase() {
  const host = process.env.MYSQL_HOST ?? "localhost";
  const port = Number(process.env.MYSQL_PORT ?? 3306);
  const user = requireEnv("MYSQL_USER");
  const password = requireEnv("MYSQL_PASSWORD");
  const database = requireEnv("MYSQL_DB");

  const conn = await mariadb.createConnection({ host, port, user, password });

  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  console.log(`✓ Database ready: ${database}`);
  await conn.end();

  return database;
}

async function tableExists(conn: mariadb.Connection, table: string) {
  const rows = await conn.query<{ cnt: number }[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [process.env.MYSQL_DB, table],
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function columnExists(
  conn: mariadb.Connection,
  table: string,
  column: string,
) {
  const rows = await conn.query<{ COLUMN_NAME: string }[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [process.env.MYSQL_DB, table, column],
  );
  return rows.length > 0;
}

async function addColumn(
  conn: mariadb.Connection,
  table: string,
  column: string,
  definition: string,
) {
  if (await columnExists(conn, table, column)) {
    console.log(`  skip ${table}.${column} (exists)`);
    return;
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  console.log(`  added ${table}.${column}`);
}

async function createFreshSchema(conn: mariadb.Connection) {
  console.log("\nFresh install — creating all tables...");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS tbl_employee (
      emp_employee_id VARCHAR(30) NOT NULL,
      emp_name VARCHAR(45) NULL,
      emp_designation VARCHAR(100) NULL,
      emp_username VARCHAR(50) NOT NULL,
      emp_password VARCHAR(255) NOT NULL,
      emp_headquarters VARCHAR(255) NULL,
      region VARCHAR(100) NULL,
      zone VARCHAR(50) NULL,
      l1_manager VARCHAR(255) NULL,
      l1_manager_id VARCHAR(50) NULL,
      PRIMARY KEY (emp_employee_id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  console.log("  tbl_employee OK");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS doctor_table (
      id INTEGER NOT NULL AUTO_INCREMENT,
      doctor_id VARCHAR(50) NOT NULL,
      doctor_name VARCHAR(255) NULL,
      speciality VARCHAR(255) NULL,
      emp_headquarters VARCHAR(255) NULL,
      region VARCHAR(100) NULL,
      l1_manager VARCHAR(255) NULL,
      l1_manager_id VARCHAR(50) NULL,
      image_url TEXT NULL,
      interview_token VARCHAR(191) NULL,
      interview_status ENUM('DRAFT','SENT','OPENED','IN_PROGRESS','COMPLETED','EXPIRED') NULL DEFAULT 'SENT',
      created_by_employee_id VARCHAR(30) NULL,
      expires_at DATETIME(3) NULL,
      opened_at DATETIME(3) NULL,
      started_at DATETIME(3) NULL,
      completed_at DATETIME(3) NULL,
      podcast_created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
      podcast_updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE INDEX doctor_table_interview_token_key(interview_token),
      INDEX doctor_table_created_by_employee_id_idx(created_by_employee_id),
      INDEX doctor_table_doctor_id_idx(doctor_id),
      INDEX doctor_table_interview_status_idx(interview_status),
      PRIMARY KEY (id),
      CONSTRAINT doctor_table_created_by_employee_id_fkey
        FOREIGN KEY (created_by_employee_id) REFERENCES tbl_employee(emp_employee_id)
        ON DELETE SET NULL ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  console.log("  doctor_table OK");

  await createPodcastTables(conn);
}

async function createPodcastTables(conn: mariadb.Connection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS question_table (
      id VARCHAR(191) NOT NULL,
      slug VARCHAR(64) NOT NULL,
      title VARCHAR(191) NOT NULL,
      prompt TEXT NOT NULL,
      \`order\` INTEGER NOT NULL,
      avatar_video_url TEXT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL,
      UNIQUE INDEX question_table_slug_key(slug),
      UNIQUE INDEX question_table_order_key(\`order\`),
      PRIMARY KEY (id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  console.log("  question_table OK");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS asset_table (
      id VARCHAR(191) NOT NULL,
      \`key\` VARCHAR(512) NOT NULL,
      bucket VARCHAR(191) NOT NULL,
      endpoint TEXT NULL,
      mime_type VARCHAR(128) NOT NULL,
      size_bytes INTEGER NOT NULL,
      duration_seconds INTEGER NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE INDEX asset_table_key_key(\`key\`),
      PRIMARY KEY (id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  console.log("  asset_table OK");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS answer_recording_table (
      id VARCHAR(191) NOT NULL,
      doctor_id INTEGER NOT NULL,
      question_id VARCHAR(191) NOT NULL,
      asset_id VARCHAR(191) NOT NULL,
      attempt_number INTEGER NOT NULL DEFAULT 1,
      status ENUM('UPLOADING','READY','FAILED') NOT NULL DEFAULT 'READY',
      accepted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL,
      UNIQUE INDEX answer_recording_table_doctor_id_question_id_attempt_number_key(doctor_id, question_id, attempt_number),
      INDEX answer_recording_table_doctor_id_idx(doctor_id),
      INDEX answer_recording_table_question_id_idx(question_id),
      PRIMARY KEY (id),
      CONSTRAINT answer_recording_table_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctor_table(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT answer_recording_table_question_id_fkey FOREIGN KEY (question_id) REFERENCES question_table(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT answer_recording_table_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES asset_table(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  console.log("  answer_recording_table OK");
}

async function extendLegacyDoctorTable(conn: mariadb.Connection) {
  console.log("\nLegacy DB — extending existing doctor_table...");
  await addColumn(conn, "doctor_table", "image_url", "`image_url` TEXT NULL");
  await addColumn(
    conn,
    "doctor_table",
    "interview_token",
    "`interview_token` VARCHAR(191) NULL",
  );
  await addColumn(
    conn,
    "doctor_table",
    "interview_status",
    "`interview_status` ENUM('DRAFT','SENT','OPENED','IN_PROGRESS','COMPLETED','EXPIRED') NULL DEFAULT 'SENT'",
  );
  await addColumn(
    conn,
    "doctor_table",
    "created_by_employee_id",
    "`created_by_employee_id` VARCHAR(30) NULL",
  );
  await addColumn(conn, "doctor_table", "expires_at", "`expires_at` DATETIME(3) NULL");
  await addColumn(conn, "doctor_table", "opened_at", "`opened_at` DATETIME(3) NULL");
  await addColumn(conn, "doctor_table", "started_at", "`started_at` DATETIME(3) NULL");
  await addColumn(
    conn,
    "doctor_table",
    "completed_at",
    "`completed_at` DATETIME(3) NULL",
  );
  await addColumn(
    conn,
    "doctor_table",
    "podcast_created_at",
    "`podcast_created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3)",
  );
  await addColumn(
    conn,
    "doctor_table",
    "podcast_updated_at",
    "`podcast_updated_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)",
  );
  await createPodcastTables(conn);
}

async function main() {
  const database = await ensureDatabase();

  const conn = await mariadb.createConnection({
    host: process.env.MYSQL_HOST ?? "localhost",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: requireEnv("MYSQL_USER"),
    password: requireEnv("MYSQL_PASSWORD"),
    database,
  });

  const hasDoctorTable = await tableExists(conn, "doctor_table");

  if (!hasDoctorTable) {
    await createFreshSchema(conn);
  } else if (!(await columnExists(conn, "doctor_table", "interview_token"))) {
    await extendLegacyDoctorTable(conn);
  } else {
    console.log("\nTables exist — ensuring podcast tables only...");
    await createPodcastTables(conn);
  }

  await conn.end();

  console.log("\nSyncing Prisma schema...");
  execSync("npx prisma generate", { stdio: "inherit" });

  console.log("\nDone. Next: npm run prisma:seed && npm run dev");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
