import type { Connection } from "mariadb";

export async function columnExists(
  conn: Connection,
  table: string,
  column: string,
) {
  const rows = await conn.query<{ cnt: number }[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [process.env.MYSQL_DB, table, column],
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

export async function tableExists(conn: Connection, table: string) {
  const rows = await conn.query<{ cnt: number }[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [process.env.MYSQL_DB, table],
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

export async function getColumnDataType(
  conn: Connection,
  table: string,
  column: string,
) {
  const rows = await conn.query<{ DATA_TYPE: string }[]>(
    `SELECT DATA_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [process.env.MYSQL_DB, table, column],
  );
  return rows[0]?.DATA_TYPE?.toLowerCase() ?? null;
}

/** Live (0001_init) uses doctor_code; local uses doctor_id for the MR code. */
export async function doctorCodeColumn(conn: Connection) {
  if (await columnExists(conn, "doctor_table", "doctor_id")) {
    const idType = await getColumnDataType(conn, "doctor_table", "id");
    if (idType === "int" || idType === "integer") {
      return "doctor_id";
    }
  }
  if (await columnExists(conn, "doctor_table", "doctor_code")) {
    return "doctor_code";
  }
  return "doctor_id";
}

export async function dropForeignKeysOnColumn(
  conn: Connection,
  table: string,
  column: string,
) {
  const fks = await conn.query<{ CONSTRAINT_NAME: string }[]>(
    `SELECT CONSTRAINT_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [process.env.MYSQL_DB, table, column],
  );

  for (const fk of fks) {
    await conn.query(
      `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
    );
    console.log(`  dropped FK ${table}.${fk.CONSTRAINT_NAME}`);
  }
}
