import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "MR" | "ADMIN";
    } & DefaultSession["user"];
  }

  interface User {
    role: "MR" | "ADMIN";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "MR" | "ADMIN";
  }
}
