import type { ConnectionConfig } from "mariadb";

export function getMariaDbConfig(
  extra?: Partial<ConnectionConfig>,
): ConnectionConfig {
  const sslEnabled = process.env.MYSQL_SSL === "true";
  const host = process.env.MYSQL_HOST ?? "localhost";
  const hostIp = process.env.MYSQL_HOST_IP?.trim();
  const finalHost = hostIp || host;
  const servername =
    hostIp && host !== "localhost" && host !== "127.0.0.1" ? host : undefined;

  return {
    host: finalHost,
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
    ...(sslEnabled
      ? {
          ssl: {
            rejectUnauthorized: false,
            ...(servername ? { servername } : {}),
          },
        }
      : {}),
    ...extra,
  };
}
