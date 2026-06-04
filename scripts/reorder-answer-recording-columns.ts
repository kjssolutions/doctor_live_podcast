/**
 * Puts doctor_code, doctor_name, employee_id right after number in answer_recording_table.
 * Run: npx tsx scripts/reorder-answer-recording-columns.ts
 */
import "dotenv/config";

import * as mariadb from "mariadb";

async function main() {
  const conn = await mariadb.createConnection({
    host: process.env.MYSQL_HOST ?? "localhost",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
  });

  await conn.query(`
    ALTER TABLE answer_recording_table
      MODIFY COLUMN doctor_code VARCHAR(50) NOT NULL AFTER \`number\`,
      MODIFY COLUMN doctor_name VARCHAR(255) NULL AFTER doctor_code,
      MODIFY COLUMN employee_id VARCHAR(30) NULL AFTER doctor_name
  `);

  console.log(
    "✓ answer_recording_table column order: number → doctor_code → doctor_name → employee_id → …",
  );
  await conn.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
