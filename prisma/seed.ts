import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../src/generated/prisma/client";
import { getDatabaseUrl } from "../src/lib/env";
import { createInterviewToken } from "../src/lib/tokens";

const adapter = new PrismaMariaDb(getDatabaseUrl());
const prisma = new PrismaClient({ adapter });

const employees = [
  {
    empEmployeeId: "F001978",
    empName: "ANUP KUMAR DEY",
    empDesignation: "MR",
    empUsername: "F001978",
    empPassword: "F001978",
    empHeadquarters: "TEZPUR",
    region: "NORTH EAST",
    zone: "EAST",
    l1Manager: "UTPAL SARMA",
    l1ManagerId: "F017480",
  },
  {
    empEmployeeId: "F001979",
    empName: "RAHUL SHARMA",
    empDesignation: "MR",
    empUsername: "F001979",
    empPassword: "F001979",
    empHeadquarters: "GUWAHATI",
    region: "NORTH EAST",
    zone: "EAST",
    l1Manager: "UTPAL SARMA",
    l1ManagerId: "F017480",
  },
  {
    empEmployeeId: "F001980",
    empName: "PRIYA DAS",
    empDesignation: "MR",
    empUsername: "F001980",
    empPassword: "F001980",
    empHeadquarters: "SILCHAR",
    region: "NORTH EAST",
    zone: "EAST",
    l1Manager: "UTPAL SARMA",
    l1ManagerId: "F017480",
  },
  {
    empEmployeeId: "F001981",
    empName: "VIKASH PATEL",
    empDesignation: "MR",
    empUsername: "F001981",
    empPassword: "F001981",
    empHeadquarters: "PATNA",
    region: "EAST",
    zone: "EAST",
    l1Manager: "AMIT SINGH",
    l1ManagerId: "F017481",
  },
  {
    empEmployeeId: "F001982",
    empName: "NEHA GUPTA",
    empDesignation: "MR",
    empUsername: "F001982",
    empPassword: "F001982",
    empHeadquarters: "RANCHI",
    region: "EAST",
    zone: "EAST",
    l1Manager: "AMIT SINGH",
    l1ManagerId: "F017481",
  },
  {
    empEmployeeId: "F001983",
    empName: "SURESH REDDY",
    empDesignation: "MR",
    empUsername: "F001983",
    empPassword: "F001983",
    empHeadquarters: "HYDERABAD",
    region: "SOUTH",
    zone: "SOUTH",
    l1Manager: "KAVITA RAO",
    l1ManagerId: "F017482",
  },
  {
    empEmployeeId: "F001984",
    empName: "LAKSHMI NAIR",
    empDesignation: "MR",
    empUsername: "F001984",
    empPassword: "F001984",
    empHeadquarters: "KOCHI",
    region: "SOUTH",
    zone: "SOUTH",
    l1Manager: "KAVITA RAO",
    l1ManagerId: "F017482",
  },
  {
    empEmployeeId: "F001985",
    empName: "ARJUN MEHTA",
    empDesignation: "MR",
    empUsername: "F001985",
    empPassword: "F001985",
    empHeadquarters: "MUMBAI",
    region: "WEST",
    zone: "WEST",
    l1Manager: "SANJAY KULKARNI",
    l1ManagerId: "F017483",
  },
  {
    empEmployeeId: "F001986",
    empName: "POOJA JOSHI",
    empDesignation: "MR",
    empUsername: "F001986",
    empPassword: "F001986",
    empHeadquarters: "PUNE",
    region: "WEST",
    zone: "WEST",
    l1Manager: "SANJAY KULKARNI",
    l1ManagerId: "F017483",
  },
  {
    empEmployeeId: "F001987",
    empName: "MANOJ VERMA",
    empDesignation: "MR",
    empUsername: "F001987",
    empPassword: "F001987",
    empHeadquarters: "DELHI",
    region: "NORTH",
    zone: "NORTH",
    l1Manager: "ROHIT MALHOTRA",
    l1ManagerId: "F017484",
  },
  {
    empEmployeeId: "F001988",
    empName: "KAVITA SINGH",
    empDesignation: "MR",
    empUsername: "F001988",
    empPassword: "F001988",
    empHeadquarters: "LUCKNOW",
    region: "NORTH",
    zone: "NORTH",
    l1Manager: "ROHIT MALHOTRA",
    l1ManagerId: "F017484",
  },
  {
    empEmployeeId: "F001989",
    empName: "DEEPAK YADAV",
    empDesignation: "MR",
    empUsername: "F001989",
    empPassword: "F001989",
    empHeadquarters: "JAIPUR",
    region: "NORTH",
    zone: "NORTH",
    l1Manager: "ROHIT MALHOTRA",
    l1ManagerId: "F017484",
  },
  {
    empEmployeeId: "F001990",
    empName: "ANITA ROY",
    empDesignation: "MR",
    empUsername: "F001990",
    empPassword: "F001990",
    empHeadquarters: "KOLKATA",
    region: "EAST",
    zone: "EAST",
    l1Manager: "AMIT SINGH",
    l1ManagerId: "F017481",
  },
  {
    empEmployeeId: "F001991",
    empName: "HARISH IYER",
    empDesignation: "MR",
    empUsername: "F001991",
    empPassword: "F001991",
    empHeadquarters: "CHENNAI",
    region: "SOUTH",
    zone: "SOUTH",
    l1Manager: "KAVITA RAO",
    l1ManagerId: "F017482",
  },
  {
    empEmployeeId: "F001992",
    empName: "MEERA KULKARNI",
    empDesignation: "MR",
    empUsername: "F001992",
    empPassword: "F001992",
    empHeadquarters: "NAGPUR",
    region: "WEST",
    zone: "WEST",
    l1Manager: "SANJAY KULKARNI",
    l1ManagerId: "F017483",
  },
  {
    empEmployeeId: "F001993",
    empName: "ROHIT AGARWAL",
    empDesignation: "MR",
    empUsername: "F001993",
    empPassword: "F001993",
    empHeadquarters: "INDORE",
    region: "CENTRAL",
    zone: "CENTRAL",
    l1Manager: "PRIYA MENON",
    l1ManagerId: "F017485",
  },
  {
    empEmployeeId: "F001994",
    empName: "SUNITA PILLAI",
    empDesignation: "MR",
    empUsername: "F001994",
    empPassword: "F001994",
    empHeadquarters: "BHUBANESWAR",
    region: "EAST",
    zone: "EAST",
    l1Manager: "AMIT SINGH",
    l1ManagerId: "F017481",
  },
  {
    empEmployeeId: "F001995",
    empName: "KARAN BHATT",
    empDesignation: "MR",
    empUsername: "F001995",
    empPassword: "F001995",
    empHeadquarters: "AHMEDABAD",
    region: "WEST",
    zone: "WEST",
    l1Manager: "SANJAY KULKARNI",
    l1ManagerId: "F017483",
  },
  {
    empEmployeeId: "F001996",
    empName: "DIVYA NAIR",
    empDesignation: "MR",
    empUsername: "F001996",
    empPassword: "F001996",
    empHeadquarters: "BANGALORE",
    region: "SOUTH",
    zone: "SOUTH",
    l1Manager: "KAVITA RAO",
    l1ManagerId: "F017482",
  },
  {
    empEmployeeId: "F001997",
    empName: "ADMIN USER",
    empDesignation: "ADMIN",
    empUsername: "ADMIN",
    empPassword: "ADMIN123",
    empHeadquarters: "HQ",
    region: "ALL",
    zone: "ALL",
    l1Manager: "SYSTEM",
    l1ManagerId: "SYS001",
  },
];

const questions = [
  {
    slug: "introduction",
    title: "Doctor Introduction",
    prompt:
      "Please introduce yourself, your specialty, and the kind of patients you usually help.",
    order: 1,
  },
  {
    slug: "condition-awareness",
    title: "Patient Awareness",
    prompt:
      "What should patients understand first about this health topic or treatment area?",
    order: 2,
  },
  {
    slug: "common-myths",
    title: "Common Myths",
    prompt:
      "What are the most common myths or mistakes patients have, and how do you guide them?",
    order: 3,
  },
  {
    slug: "closing-advice",
    title: "Closing Advice",
    prompt:
      "What final advice would you give patients who are considering speaking with a specialist?",
    order: 4,
  },
];

async function main() {
  console.log("Seeding database:", process.env.MYSQL_DB ?? "doctor_live_podcast");

  for (const employee of employees) {
    await prisma.employee.upsert({
      where: { empEmployeeId: employee.empEmployeeId },
      update: employee,
      create: employee,
    });
  }
  console.log(`✓ ${employees.length} employees in tbl_employee`);

  for (const question of questions) {
    await prisma.question.upsert({
      where: { slug: question.slug },
      update: question,
      create: question,
    });
  }
  console.log(`✓ ${questions.length} questions in question_table`);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const sampleCode = "DOC-DEMO-001";
  const existingDoctor = await prisma.doctor.findFirst({
    where: { doctorCode: sampleCode, interviewToken: { not: null } },
  });

  if (existingDoctor) {
    console.log(`✓ Sample podcast doctor already exists (${sampleCode})`);
  } else {
    await prisma.doctor.create({
      data: {
        doctorName: "Dr. Sample Kumar",
        doctorCode: sampleCode,
        specialty: "General Physician",
        interviewToken: createInterviewToken(),
        interviewStatus: "SENT",
        createdByEmployeeId: "F001978",
        expiresAt,
        podcastCreatedAt: new Date(),
      },
    });
    console.log(
      `✓ Sample podcast doctor created (${sampleCode}) — login F001978 / F001978`,
    );
  }

  console.log(`✓ Employees use tbl_employee (${employees.length} seeded)`);

  console.log("\nLogin test MR:  F001978 / F001978");
  console.log("Login test Admin: ADMIN / ADMIN123");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
