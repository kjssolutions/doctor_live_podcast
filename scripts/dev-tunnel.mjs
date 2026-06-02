import { spawn } from "node:child_process";

async function printTunnelPassword() {
  try {
    const response = await fetch("https://loca.lt/mytunnelpassword");
    if (!response.ok) {
      return;
    }

    const password = (await response.text()).trim();
    console.log("\n--- LocalTunnel phone access ---");
    console.log("If loca.lt asks for a tunnel password, enter:");
    console.log(`  ${password}\n`);
  } catch {
    // The tunnel still works; localtunnel may simply skip the password page.
  }
}

await printTunnelPassword();

const child = spawn("npx", ["--yes", "localtunnel", "--port", "3000"], {
  shell: true,
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
