import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");

function getLanIpv4() {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

const ip = process.env.LAN_IP || getLanIpv4();
if (!ip) {
  console.error("Could not detect LAN IP. Set LAN_IP=192.168.0.110 and retry.");
  process.exit(1);
}

console.log("\n--- HTTPS for phone (same Wi-Fi) ---");
console.log("Stop any running `npm run dev` first (Ctrl+C).");
console.log(`Interview URL on phone:\n  https://${ip}:3000/interview/YOUR_TOKEN`);
console.log("Accept the certificate warning in Chrome if asked.\n");

const child = spawn(
  process.execPath,
  [nextCli, "dev", "-H", ip, "--experimental-https", "-p", "3000"],
  { cwd: root, stdio: "inherit" },
);

child.on("exit", (code) => process.exit(code ?? 0));
