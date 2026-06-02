import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

// Local tunnels (loca.lt/ngrok) forward requests with their public host.
// NextAuth v4 only trusts that host when this flag is set.
process.env.AUTH_TRUST_HOST ??= "true";

const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  secret:
    process.env.NEXTAUTH_SECRET ??
    (process.env.NODE_ENV === "development" ? "dev-secret-change-me" : undefined),
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Employee Login",
      credentials: {
        username: { label: "Employee ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const employee = await prisma.employee.findFirst({
          where: { empUsername: parsed.data.username.trim() },
        });

        if (!employee) {
          return null;
        }

        if (employee.empPassword !== parsed.data.password) {
          return null;
        }

        const role =
          employee.empDesignation?.toUpperCase() === "ADMIN" ? "ADMIN" : "MR";

        return {
          id: employee.empEmployeeId,
          name: employee.empName ?? employee.empUsername,
          email: employee.empUsername,
          role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "MR" | "ADMIN";
      }

      return session;
    },
  },
};
