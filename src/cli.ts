import readline from "node:readline";

import { RuntimeHost } from "./runtime/RuntimeHost";
import {
  ensureSharedRuntimeDaemon,
  listSharedRuntimes,
  runSharedRuntimeDaemon,
  runSharedRuntimeStdioBridge,
} from "./runtime/SharedRuntimeDaemon";
import type {
  RuntimeProtocolHandshake,
  RuntimeProtocolRequest,
  RuntimeProtocolResponse,
  RuntimeSessionRole,
} from "./runtime/types";

function writeJsonLine(
  payload:
    | RuntimeProtocolHandshake
    | RuntimeProtocolResponse
    | Record<string, unknown>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(`${JSON.stringify(payload)}\n`, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function getFlagValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
}

function parseSessionRole(args: string[]): RuntimeSessionRole | "auto" {
  const role = getFlagValue(args, "--role");
  if (role === "owner" || role === "writer" || role === "observer") {
    return role;
  }
  return "auto";
}

async function runRuntimeStdioHost(): Promise<void> {
  const host = new RuntimeHost();
  await writeJsonLine(host.handshake());

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  rl.on("line", async (line) => {
    if (!line.trim()) {
      return;
    }

    try {
      const request = JSON.parse(line) as RuntimeProtocolRequest;
      const response = await host.handle(request);
      await writeJsonLine(response);

      const action = host.consumeControlAction();
      if (action === "detach" || action === "shutdown") {
        rl.close();
        host.dispose();
        process.exit(0);
      }
    } catch (error) {
      await writeJsonLine({
        ok: false,
        operation: "runtime.snapshot",
        error: {
          code: "invalid_json",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}

async function printSharedRuntimeList(): Promise<void> {
  const runtimes = await listSharedRuntimes();
  await writeJsonLine({
    runtimes,
  });
}

async function printSharedRuntimeStart(runtimeName: string): Promise<void> {
  const metadata = await ensureSharedRuntimeDaemon(runtimeName);
  await writeJsonLine({
    started: true,
    runtimeName,
    pid: metadata.pid,
    socketPath: metadata.socketPath,
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === "runtime" && args[1] === "stdio") {
    await runRuntimeStdioHost();
    return;
  }

  if (args[0] === "runtime" && args[1] === "shared") {
    if (args[2] === "list") {
      await printSharedRuntimeList();
      return;
    }

    const runtimeName = getFlagValue(args, "--runtime");
    if (!runtimeName) {
      process.stderr.write("Missing required --runtime <name>\n");
      process.exitCode = 1;
      return;
    }

    if (args[2] === "start") {
      await printSharedRuntimeStart(runtimeName);
      return;
    }

    if (args[2] === "stdio") {
      await runSharedRuntimeStdioBridge(runtimeName, parseSessionRole(args));
      return;
    }

    if (args[2] === "daemon") {
      const socketPath = getFlagValue(args, "--socket");
      const metadataPath = getFlagValue(args, "--metadata");
      if (!socketPath || !metadataPath) {
        process.stderr.write(
          "Missing required --socket <path> and --metadata <path>\n",
        );
        process.exitCode = 1;
        return;
      }

      await runSharedRuntimeDaemon(runtimeName, socketPath, metadataPath);
      return;
    }
  }

  process.stderr.write(
    "Usage: cadenza runtime stdio | cadenza runtime shared <start|stdio|list|daemon>\n",
  );
  process.exitCode = 1;
}

void main();
