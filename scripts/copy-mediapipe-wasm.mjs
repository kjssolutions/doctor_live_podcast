/**
 * Copy MediaPipe WASM into public/ so iOS Safari can load it same-origin.
 * Run from postinstall / manually: node scripts/copy-mediapipe-wasm.mjs
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe", "wasm");

if (!existsSync(src)) {
  console.warn("skip copy-mediapipe-wasm: package wasm folder missing");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("✓ MediaPipe WASM → public/mediapipe/wasm");
