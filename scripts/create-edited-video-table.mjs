import * as mariadb from "mariadb";

const conn = await mariadb.createConnection({
  host: process.env.MYSQL_HOST ?? "localhost",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "12345678",
  database: process.env.MYSQL_DB ?? "doctor_live_podcast",
});

await conn.query(`
  CREATE TABLE IF NOT EXISTS \`edited_video_table\` (
    \`id\`                      VARCHAR(191) NOT NULL,
    \`doctor_id\`               INT          NOT NULL,
    \`asset_id\`                VARCHAR(191) NOT NULL,
    \`created_by_employee_id\`  VARCHAR(30)  NULL,
    \`created_at\`              DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\`              DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (\`id\`),
    UNIQUE INDEX \`edited_video_table_doctor_id_key\` (\`doctor_id\`),
    INDEX        \`edited_video_table_doctor_id_idx\`  (\`doctor_id\`),
    INDEX        \`edited_video_table_asset_id_idx\`   (\`asset_id\`),
    INDEX        \`edited_video_table_emp_id_idx\`     (\`created_by_employee_id\`),

    CONSTRAINT \`ev_doctor_fkey\`
      FOREIGN KEY (\`doctor_id\`) REFERENCES \`doctor_table\` (\`id\`)
      ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT \`ev_asset_fkey\`
      FOREIGN KEY (\`asset_id\`) REFERENCES \`asset_table\` (\`id\`)
      ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT \`ev_employee_fkey\`
      FOREIGN KEY (\`created_by_employee_id\`) REFERENCES \`tbl_employee\` (\`emp_employee_id\`)
      ON DELETE SET NULL ON UPDATE CASCADE
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
`);

console.log("✓ edited_video_table created (or already existed).");
await conn.end();
