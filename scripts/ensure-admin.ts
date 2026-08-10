import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const adapter = new PrismaMariaDb({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DB,
  port: Number(process.env.MYSQL_PORT || 3306),
  connectionLimit: 3,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.employee.findMany({
    where: {
      OR: [
        { empUsername: "ADMIN" },
        { empEmployeeId: "F001997" },
        { empDesignation: "ADMIN" },
        { role: "ADMIN" },
      ],
    },
    select: {
      empEmployeeId: true,
      empUsername: true,
      empName: true,
      empDesignation: true,
      role: true,
    },
  });
  console.log(JSON.stringify(rows, null, 2));

  for (const row of rows) {
    if (row.role !== "ADMIN" || row.empDesignation !== "ADMIN") {
      await prisma.employee.update({
        where: { empEmployeeId: row.empEmployeeId },
        data: { role: "ADMIN", empDesignation: "ADMIN" },
      });
      console.log("Updated", row.empEmployeeId, "→ role ADMIN");
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
