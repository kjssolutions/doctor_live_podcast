import * as mariadb from "mariadb";

const conn = await mariadb.createConnection({
  host: process.env.MYSQL_HOST ?? "localhost",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "",
  database: process.env.MYSQL_DB ?? "doctor_live_podcast",
});

// MySQL on Windows installs often don't support ADD COLUMN IF NOT EXISTS reliably,
// so we probe information_schema first and only then ALTER TABLE.
const cols = await conn.query(
  `
    SELECT COLUMN_NAME as columnName
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'doctor_table'
      AND COLUMN_NAME IN ('post_production_status', 'spotify_url')
  `,
);
const existing = new Set(cols.map((c) => String(c.columnName)));

if (!existing.has("post_production_status")) {
  await conn.query(
    `
      ALTER TABLE \`doctor_table\`
        ADD COLUMN \`post_production_status\`
          ENUM('PROCESSING','DONE','SPOTIFY') NOT NULL DEFAULT 'PROCESSING'
    `,
  );
}

if (!existing.has("spotify_url")) {
  await conn.query(
    `
      ALTER TABLE \`doctor_table\`
        ADD COLUMN \`spotify_url\` TEXT NULL
    `,
  );
}

console.log("✓ doctor_table updated with post_production_status + spotify_url");
await conn.end();

