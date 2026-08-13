/**
 * Creates deploy.tar for CapRover upload (source + Dockerfile, no bloat).
 * Run: npm run deploy:tar
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outFile = path.join(root, "deploy.tar");
const gzipFile = path.join(root, "deploy.tar.gz");

const excludes = [
  "node_modules",
  ".next",
  ".git",
  ".env",
  ".env.local",
  "deploy.tar",
  "deploy.tar.gz",
  ".cursor",
  "terminals",
  "assets",
  "coverage",
  "certificates",
  // Rebuilt by postinstall on CapRover (~35MB)
  "public/mediapipe",
  // Local-only reference demo (~90MB) — host on Spaces / CDN for production
  "public/Videos/intas-demo.mp4",
];

for (const file of [outFile, gzipFile]) {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

const isWindows = process.platform === "win32";

if (isWindows) {
  const excludeArgs = excludes.map((e) => `--exclude=${e}`).join(" ");
  execSync(`tar -cf "${outFile}" ${excludeArgs} -C "${root}" .`, {
    stdio: "inherit",
    shell: true,
  });
} else {
  const excludeArgs = excludes.map((e) => `--exclude=./${e}`).join(" ");
  execSync(`tar -cf "${outFile}" ${excludeArgs} .`, {
    cwd: root,
    stdio: "inherit",
  });
}

const sizeMb = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(2);
console.log(`\n✓ Created ${outFile} (${sizeMb} MB)`);
console.log("  CapRover → Deployment → Upload tar file → choose deploy.tar");
console.log(
  "  Note: intas-demo.mp4 is not included (upload to Spaces for production).",
);
