/**
 * Upload Q1–Q4 Julius Caesar question videos to Spaces.
 * Run: npx tsx scripts/upload-question-videos.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { STORAGE_ROOT } from "../src/lib/storage-keys";
import { uploadObject } from "../src/lib/spaces";

async function main() {
  for (const order of [1, 2, 3, 4] as const) {
    const localPath = path.join(
      process.cwd(),
      "public",
      "Videos",
      `question${order}.mp4`,
    );
    if (!fs.existsSync(localPath)) {
      throw new Error(`Missing file: ${localPath}`);
    }

    const body = fs.readFileSync(localPath);
    const key = `${STORAGE_ROOT}/questions/question${order}.mp4`;
    console.log(`Uploading Q${order} (${(body.length / (1024 * 1024)).toFixed(1)} MB) → ${key}`);

    const url = await uploadObject({
      key,
      body,
      mimeType: "video/mp4",
    });
    console.log(`✓ Q${order}: ${url}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
