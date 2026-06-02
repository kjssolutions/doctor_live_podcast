import crypto from "node:crypto";

export function createInterviewToken() {
  return crypto.randomBytes(32).toString("base64url");
}
