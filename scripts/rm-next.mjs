import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), ".next");
if (fs.existsSync(dir)) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("Removed .next cache");
  console.log("Start the dev server only after this finishes (do not delete .next while dev is running).");
} else {
  console.log(".next not found (nothing to remove)");
}
