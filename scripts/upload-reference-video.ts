/**
 * One-off: upload local Intas demo to Spaces for production reference video.
 * Run: npx tsx scripts/upload-reference-video.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { STORAGE_ROOT } from "../src/lib/storage-keys";
import { uploadObject } from "../src/lib/spaces";

const localPath = path.join(process.cwd(), "public", "Videos", "intas-demo.mp4");
const key = `${STORAGE_ROOT}/reference/intas-demo.mp4`;

async function main() {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Missing file: ${localPath}`);
  }

  const body = fs.readFileSync(localPath);
  console.log(`Uploading ${(body.length / (1024 * 1024)).toFixed(1)} MB → ${key}`);

  const url = await uploadObject({
    key,
    body,
    mimeType: "video/mp4",
  });

  console.log(`✓ Public URL:\n${url}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
