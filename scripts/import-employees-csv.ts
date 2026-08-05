/**
 * Import employees from speek_the_leak_emp.csv into tbl_employee.
 * Adds 2L/3L manager columns if missing. Keeps existing employees by upserting.
 *
 * Usage:
 *   npx tsx scripts/import-employees-csv.ts
 *   npx tsx scripts/import-employees-csv.ts "C:\Users\techs\Downloads\speek_the_leak_emp.csv"
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";
import * as mariadb from "mariadb";

import { getMariaDbConfig } from "./mariadb-config";

config({ path: path.join(process.cwd(), ".env") });

type CsvRow = Record<string, string>;

function parseCsv(content: string): CsvRow[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (!cols.length || cols.every((c) => !c.trim())) continue;
    const row: CsvRow = {};
    headers.forEach((header, idx) => {
      row[header] = (cols[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return rows;
}

/** Minimal CSV splitter supporting quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function emptyToNull(value: string | undefined) {
  const v = (value ?? "").trim();
  return v ? v : null;
}

async function ensureColumns(conn: mariadb.Connection) {
  const db = process.env.MYSQL_DB;
  if (!db) throw new Error("MYSQL_DB missing in .env");

  const needed: Array<{ name: string; ddl: string }> = [
    { name: "area", ddl: "VARCHAR(100) NULL" },
    { name: "division", ddl: "VARCHAR(100) NULL" },
    { name: "role", ddl: "VARCHAR(50) NULL" },
    { name: "l2_manager_id", ddl: "VARCHAR(50) NULL" },
    { name: "l3_manager_id", ddl: "VARCHAR(50) NULL" },
  ];

  for (const col of needed) {
    const rows = await conn.query(
      `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tbl_employee' AND COLUMN_NAME = ?`,
      [db, col.name],
    );
    const count = Number(rows[0]?.c ?? 0);
    if (count === 0) {
      await conn.query(
        `ALTER TABLE tbl_employee ADD COLUMN \`${col.name}\` ${col.ddl}`,
      );
      console.log(`  + added column ${col.name}`);
    }
  }

  // Drop unused manager *name* columns (IDs are enough)
  for (const name of ["l1_manager", "l2_manager", "l3_manager"]) {
    const rows = await conn.query(
      `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tbl_employee' AND COLUMN_NAME = ?`,
      [db, name],
    );
    if (Number(rows[0]?.c ?? 0) > 0) {
      await conn.query(`ALTER TABLE tbl_employee DROP COLUMN \`${name}\``);
      console.log(`  - dropped column ${name}`);
    }
  }

  // Widen emp_name for longer names
  await conn.query(
    `ALTER TABLE tbl_employee MODIFY COLUMN emp_name VARCHAR(255) NULL`,
  );
}

async function main() {
  const csvPath =
    process.argv[2] ||
    path.join(
      process.env.USERPROFILE || process.env.HOME || "",
      "Downloads",
      "speek_the_leak_emp.csv",
    );

  console.log(`Reading CSV: ${csvPath}`);
  const raw = readFileSync(csvPath, "utf8");
  const rows = parseCsv(raw);
  console.log(`Parsed ${rows.length} employees`);

  const conn = await mariadb.createConnection(
    getMariaDbConfig({ allowPublicKeyRetrieval: true }),
  );

  try {
    console.log("Ensuring tbl_employee columns…");
    await ensureColumns(conn);

    let upserted = 0;
    for (const row of rows) {
      const empId = emptyToNull(row.emp_id);
      if (!empId) continue;

      const l1Id = emptyToNull(row["1lmanager_id"]);
      const l2Id = emptyToNull(row["2lmanager_id"]);
      const l3Id = emptyToNull(row["3lmanager_id"]);

      await conn.query(
        `INSERT INTO tbl_employee (
          emp_employee_id, emp_name, emp_designation, emp_username, emp_password,
          emp_headquarters, area, region, zone, division, role,
          l1_manager_id, l2_manager_id, l3_manager_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          emp_name = VALUES(emp_name),
          emp_designation = VALUES(emp_designation),
          emp_username = VALUES(emp_username),
          emp_password = VALUES(emp_password),
          emp_headquarters = VALUES(emp_headquarters),
          area = VALUES(area),
          region = VALUES(region),
          zone = VALUES(zone),
          division = VALUES(division),
          role = VALUES(role),
          l1_manager_id = VALUES(l1_manager_id),
          l2_manager_id = VALUES(l2_manager_id),
          l3_manager_id = VALUES(l3_manager_id)`,
        [
          empId,
          emptyToNull(row.emp_name),
          emptyToNull(row.emp_designation) ?? emptyToNull(row.role),
          emptyToNull(row.user_name) ?? empId,
          emptyToNull(row.password) ?? empId,
          emptyToNull(row.headquarter),
          emptyToNull(row.area),
          emptyToNull(row.region),
          emptyToNull(row.zone),
          emptyToNull(row.division),
          emptyToNull(row.role),
          l1Id,
          l2Id,
          l3Id,
        ],
      );
      upserted += 1;
    }

    const countRows = await conn.query(
      `SELECT COUNT(*) AS c FROM tbl_employee`,
    );
    console.log(`✓ Upserted ${upserted} employees`);
    console.log(`✓ tbl_employee now has ${countRows[0].c} rows`);

    const sample = await conn.query(
      `SELECT emp_employee_id, emp_name, emp_designation, role,
              l1_manager_id, l2_manager_id, l3_manager_id
       FROM tbl_employee
       ORDER BY emp_employee_id
       LIMIT 5`,
    );
    console.log("Sample:");
    console.table(sample);
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
