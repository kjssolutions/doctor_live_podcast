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

  const tables = await conn.query("SHOW TABLES");
  console.log("Tables:", tables);

  for (const name of ["doctor_table", "employee_table", "tbl_employee"]) {
    try {
      const cols = await conn.query(`DESCRIBE ${name}`);
      console.log(`\n${name}:`, cols);
    } catch (error) {
      console.log(`\n${name}: missing`, error);
    }
  }

  await conn.end();
}

main().catch(console.error);
