function mysqlEnv() {
  return {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
    port: process.env.MYSQL_PORT ?? "3306",
    sslEnabled: process.env.MYSQL_SSL === "true",
  };
}

export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const { host, user, password, database, port, sslEnabled } = mysqlEnv();

  if (!host || !user || !password || !database) {
    throw new Error(
      "Database is not configured. Set DATABASE_URL or MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DB.",
    );
  }

  // DigitalOcean MySQL on Windows often fails strict CA verification (P1011).
  const ssl = sslEnabled ? "?sslaccept=accept_invalid_certs" : "";

  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}${ssl}`;
}
