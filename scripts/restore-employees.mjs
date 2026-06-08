import "dotenv/config";
import * as mariadb from "mariadb";

const EMPLOYEES = [
  ["F001978", "ANUP KUMAR DEY", "MR", "F001978", "F001978", "TEZPUR", "NORTH EAST", "EAST", "UTPAL SARMA", "F017480"],
  ["F001979", "RAHUL SHARMA", "MR", "F001979", "F001979", "GUWAHATI", "NORTH EAST", "EAST", "UTPAL SARMA", "F017480"],
  ["F001980", "PRIYA DAS", "MR", "F001980", "F001980", "SILCHAR", "NORTH EAST", "EAST", "UTPAL SARMA", "F017480"],
  ["F001981", "VIKASH PATEL", "MR", "F001981", "F001981", "PATNA", "EAST", "EAST", "AMIT SINGH", "F017481"],
  ["F001982", "NEHA GUPTA", "MR", "F001982", "F001982", "RANCHI", "EAST", "EAST", "AMIT SINGH", "F017481"],
  ["F001983", "SURESH REDDY", "MR", "F001983", "F001983", "HYDERABAD", "SOUTH", "SOUTH", "KAVITA RAO", "F017482"],
  ["F001984", "LAKSHMI NAIR", "MR", "F001984", "F001984", "KOCHI", "SOUTH", "SOUTH", "KAVITA RAO", "F017482"],
  ["F001985", "ARJUN MEHTA", "MR", "F001985", "F001985", "MUMBAI", "WEST", "WEST", "SANJAY KULKARNI", "F017483"],
  ["F001986", "POOJA JOSHI", "MR", "F001986", "F001986", "PUNE", "WEST", "WEST", "SANJAY KULKARNI", "F017483"],
  ["F001987", "MANOJ VERMA", "MR", "F001987", "F001987", "DELHI", "NORTH", "NORTH", "ROHIT MALHOTRA", "F017484"],
];

function dbConfig() {
  const host = process.env.MYSQL_HOST || "localhost";
  const hostIp = process.env.MYSQL_HOST_IP?.trim();
  const finalHost = hostIp || host;
  const servername =
    hostIp && host !== "localhost" && host !== "127.0.0.1"
      ? host
      : undefined;

  return {
    host: finalHost,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB || "doctor_live_podcast",
    port: Number(process.env.MYSQL_PORT || 3306),
    ssl:
      process.env.MYSQL_SSL === "true"
        ? {
            rejectUnauthorized: false,
            ...(servername ? { servername } : {}),
          }
        : undefined,
  };
}

async function detectEmployeeTable(conn) {
  const rows = await conn.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('tbl_employee','employee_table') ORDER BY FIELD(table_name, 'tbl_employee', 'employee_table')",
  );
  if (!rows.length) {
    throw new Error("No employee table found (expected tbl_employee or employee_table).");
  }
  const first = rows[0];
  const table =
    first.table_name ??
    first.TABLE_NAME ??
    first.Table_name ??
    Object.values(first)[0];
  if (!table || typeof table !== "string") {
    throw new Error(`Unable to resolve employee table name from metadata: ${JSON.stringify(first)}`);
  }
  return table;
}

async function main() {
  const conn = await mariadb.createConnection(dbConfig());
  try {
    const forcedTableArgIndex = process.argv.findIndex((arg) => arg === "--table");
    const forcedTable =
      forcedTableArgIndex >= 0 ? process.argv[forcedTableArgIndex + 1] : undefined;
    const table = forcedTable || (await detectEmployeeTable(conn));
    const sql = `INSERT INTO ${table} (
      emp_employee_id, emp_name, emp_designation, emp_username, emp_password,
      emp_headquarters, region, zone, l1_manager, l1_manager_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      emp_name = VALUES(emp_name),
      emp_designation = VALUES(emp_designation),
      emp_username = VALUES(emp_username),
      emp_password = VALUES(emp_password),
      emp_headquarters = VALUES(emp_headquarters),
      region = VALUES(region),
      zone = VALUES(zone),
      l1_manager = VALUES(l1_manager),
      l1_manager_id = VALUES(l1_manager_id)`;

    for (const employee of EMPLOYEES) {
      await conn.query(sql, employee);
    }

    const countRows = await conn.query(`SELECT COUNT(*) AS count FROM ${table}`);
    console.log(
      `Restored ${EMPLOYEES.length} employees into ${table}. Current total rows: ${Number(countRows[0].count)}`,
    );
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
