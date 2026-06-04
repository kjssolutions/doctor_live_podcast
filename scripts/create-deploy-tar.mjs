/**
 * Creates deploy.tar for CapRover upload (source + Dockerfile, no node_modules).
 * Run: npm run deploy:tar
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outFile = path.join(root, "deploy.tar");

const excludes = [
  "node_modules",
  ".next",
  ".git",
  ".env",
  "deploy.tar",
  ".cursor",
  "terminals",
  "assets",
  "coverage",
];

if (fs.existsSync(outFile)) {
  fs.unlinkSync(outFile);
}

const isWindows = process.platform === "win32";

if (isWindows) {
  // Windows built-in tar (Windows 10+)
  const excludeArgs = excludes.map((e) => `--exclude=${e}`).join(" ");
  execSync(`tar -cf "${outFile}" ${excludeArgs} -C "${root}" .`, {
    stdio: "inherit",
    shell: true,
  });
} else {
  const excludeArgs = excludes.map((e) => `--exclude='./${e}'`).join(" ");
  execSync(`tar -cf "${outFile}" ${excludeArgs} .`, {
    cwd: root,
    stdio: "inherit",
  });
}

const sizeMb = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(2);
console.log(`\n✓ Created ${outFile} (${sizeMb} MB)`);
console.log("  Upload in CapRover → Deployment → Upload tar file");
