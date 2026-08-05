import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");
const lockPath = join(root, ".next", "dev", "lock");
const PORT = 3000;

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

function collectPidsFromLock() {
  const pids = new Set();
  if (!existsSync(lockPath)) return pids;
  try {
    const raw = readFileSync(lockPath, "utf8").trim();
    if (!raw) return pids;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.pid) pids.add(Number(parsed.pid));
    } catch {
      const asNum = Number(raw);
      if (Number.isFinite(asNum) && asNum > 0) pids.add(asNum);
    }
  } catch {
    // ignore unreadable lock
  }
  return pids;
}

function collectPidsListeningOnPort(port) {
  const pids = new Set();
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano`, { encoding: "utf8" });
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes(`:${port}`) || !line.includes("LISTENING")) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[parts.length - 1]);
        if (Number.isFinite(pid) && pid > 0) pids.add(pid);
      }
    } else {
      const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, {
        encoding: "utf8",
      });
      for (const part of out.split(/\s+/)) {
        const pid = Number(part);
        if (Number.isFinite(pid) && pid > 0) pids.add(pid);
      }
    }
  } catch {
    // nothing listening / tools unavailable
  }
  return pids;
}

function killPid(pid) {
  if (!pid || pid === process.pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGTERM");
    }
    console.log(`Stopped leftover Next.js process (PID ${pid}).`);
  } catch {
    // already gone
  }
}

function clearStaleDevServer() {
  const pids = new Set([
    ...collectPidsFromLock(),
    ...collectPidsListeningOnPort(PORT),
  ]);
  for (const pid of pids) killPid(pid);

  if (existsSync(lockPath)) {
    try {
      unlinkSync(lockPath);
    } catch {
      // ignore
    }
  }
}

const ip = process.env.LAN_IP || getLanIpv4();
if (!ip) {
  console.error("Could not detect LAN IP. Set LAN_IP=192.168.0.110 and retry.");
  process.exit(1);
}

clearStaleDevServer();

console.log("\n--- HTTPS for phone (same Wi-Fi) ---");
console.log(`Interview URL on phone:\n  https://${ip}:${PORT}/interview/YOUR_TOKEN`);
console.log(`NEXTAUTH_URL for this session: https://${ip}:${PORT}`);
console.log("Accept the certificate warning in Chrome if asked.\n");
console.log("If /api/* returns HTML 404, stop the server and run: npm run dev:clean\n");

const nextAuthUrl = `https://${ip}:${PORT}`;

const child = spawn(
  process.execPath,
  [nextCli, "dev", "-H", ip, "--experimental-https", "-p", String(PORT)],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXTAUTH_URL: nextAuthUrl,
      AUTH_TRUST_HOST: "true",
    },
  },
);

child.on("exit", (code) => process.exit(code ?? 0));
