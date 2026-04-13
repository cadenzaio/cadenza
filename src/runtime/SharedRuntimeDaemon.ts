import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import { v4 as uuid } from "uuid";

import Cadenza from "../Cadenza";
import { RuntimeHost } from "./RuntimeHost";
import type {
  RuntimeProtocolRequest,
  RuntimeProtocolResponse,
  RuntimeSessionRole,
} from "./types";

const SHARED_RUNTIME_ROOT = path.join(
  path.sep,
  "tmp",
  "cadenza-shared-runtimes",
);
const DAEMON_STARTUP_TIMEOUT_MS = 4_000;
const DAEMON_POLL_INTERVAL_MS = 100;

interface SharedRuntimePaths {
  runtimeName: string;
  runtimeDir: string;
  socketPath: string;
  metadataPath: string;
  lockPath: string;
}

interface SharedRuntimeMetadata {
  runtimeName: string;
  socketPath: string;
  metadataPath: string;
  pid: number;
  startedAt: string;
}

interface SharedRuntimeAttachRequest {
  type: "attach";
  role?: RuntimeSessionRole | "auto";
}

interface SharedRuntimeSession {
  sessionId: string;
  role: RuntimeSessionRole;
  socket: net.Socket;
  host: RuntimeHost;
}

function runtimeSlug(runtimeName: string): string {
  return encodeURIComponent(runtimeName)
    .replace(/%/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSessionRole(value: unknown): value is RuntimeSessionRole {
  return value === "owner" || value === "writer" || value === "observer";
}

function resolveSharedRuntimePaths(runtimeName: string): SharedRuntimePaths {
  const slug = runtimeSlug(runtimeName);
  const runtimeDir = path.join(SHARED_RUNTIME_ROOT, slug);
  return {
    runtimeName,
    runtimeDir,
    socketPath: path.join(runtimeDir, "runtime.sock"),
    metadataPath: path.join(runtimeDir, "runtime.json"),
    lockPath: path.join(runtimeDir, "runtime.lock"),
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fsp.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readMetadata(
  metadataPath: string,
): Promise<SharedRuntimeMetadata | null> {
  try {
    const content = await fsp.readFile(metadataPath, "utf8");
    const parsed = JSON.parse(content) as SharedRuntimeMetadata;
    if (
      !isObject(parsed) ||
      typeof parsed.runtimeName !== "string" ||
      typeof parsed.socketPath !== "string" ||
      typeof parsed.metadataPath !== "string" ||
      typeof parsed.pid !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function canConnect(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = net.createConnection(socketPath);

    const finalize = (value: boolean) => {
      client.removeAllListeners();
      if (!client.destroyed) {
        client.destroy();
      }
      resolve(value);
    };

    client.once("connect", () => finalize(true));
    client.once("error", () => finalize(false));
  });
}

async function waitForDaemonReady(
  paths: SharedRuntimePaths,
  timeoutMs = DAEMON_STARTUP_TIMEOUT_MS,
): Promise<SharedRuntimeMetadata | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const metadata = await readMetadata(paths.metadataPath);
    if (metadata && (await canConnect(metadata.socketPath))) {
      return metadata;
    }
    await wait(DAEMON_POLL_INTERVAL_MS);
  }
  return null;
}

function resolveCliInvocation(nextArgs: string[]): {
  command: string;
  args: string[];
} {
  const invocationArgs: string[] = [];
  const cliEntry = process.argv[1];
  const possibleSourceEntry = process.argv[2];

  if (cliEntry?.endsWith(".ts")) {
    const tsxCliPath = path.resolve(
      process.cwd(),
      "node_modules",
      "tsx",
      "dist",
      "cli.mjs",
    );
    invocationArgs.push(tsxCliPath, cliEntry);
  } else if (
    cliEntry?.endsWith(path.join("tsx", "dist", "cli.mjs")) &&
    possibleSourceEntry
  ) {
    invocationArgs.push(cliEntry, possibleSourceEntry);
  } else if (cliEntry) {
    invocationArgs.push(cliEntry);
  } else {
    throw new Error("Unable to resolve the current cadenza CLI entrypoint");
  }

  return {
    command: process.execPath,
    args: [...invocationArgs, ...nextArgs],
  };
}

async function writeMetadata(
  metadataPath: string,
  metadata: SharedRuntimeMetadata,
): Promise<void> {
  await fsp.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

async function cleanupSharedRuntimeFiles(paths: SharedRuntimePaths): Promise<void> {
  await cleanupSharedRuntimeFilesWithOptions(paths, true);
}

async function cleanupSharedRuntimeFilesWithOptions(
  paths: SharedRuntimePaths,
  includeLock: boolean,
): Promise<void> {
  const removals = [
    fsp.rm(paths.socketPath, { force: true }),
    fsp.rm(paths.metadataPath, { force: true }),
  ];

  if (includeLock) {
    removals.push(fsp.rm(paths.lockPath, { force: true }));
  }

  await Promise.allSettled(removals);
}

async function startDaemonProcess(paths: SharedRuntimePaths): Promise<void> {
  const { command, args } = resolveCliInvocation([
    "runtime",
    "shared",
    "daemon",
    "--runtime",
    paths.runtimeName,
    "--socket",
    paths.socketPath,
    "--metadata",
    paths.metadataPath,
  ]);

  const child = spawn(command, args, {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
  });

  child.unref();
}

export async function ensureSharedRuntimeDaemon(
  runtimeName: string,
): Promise<SharedRuntimeMetadata> {
  const paths = resolveSharedRuntimePaths(runtimeName);
  await fsp.mkdir(paths.runtimeDir, { recursive: true });

  const existingMetadata = await readMetadata(paths.metadataPath);
  if (existingMetadata && (await canConnect(existingMetadata.socketPath))) {
    return existingMetadata;
  }

  let lockHandle: fs.promises.FileHandle | null = null;
  try {
    lockHandle = await fsp.open(paths.lockPath, "wx");
  } catch {
    const awaitedMetadata = await waitForDaemonReady(paths);
    if (awaitedMetadata) {
      return awaitedMetadata;
    }
    throw new Error(`Timed out waiting for shared runtime "${runtimeName}"`);
  }

  try {
    const latestMetadata = await readMetadata(paths.metadataPath);
    if (latestMetadata && (await canConnect(latestMetadata.socketPath))) {
      return latestMetadata;
    }

    await cleanupSharedRuntimeFilesWithOptions(paths, false);
    await startDaemonProcess(paths);

    const readyMetadata = await waitForDaemonReady(paths);
    if (!readyMetadata) {
      throw new Error(`Timed out starting shared runtime "${runtimeName}"`);
    }

    return readyMetadata;
  } finally {
    await lockHandle.close();
    await fsp.rm(paths.lockPath, { force: true });
  }
}

async function readNextJsonLine(
  lines: readline.Interface,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onLine = (line: string) => {
      cleanup();
      try {
        resolve(JSON.parse(line) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    };

    const onClose = () => {
      cleanup();
      reject(new Error("Socket closed before receiving a response"));
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      lines.off("line", onLine);
      lines.off("close", onClose);
      lines.off("error", onError);
    };

    lines.on("line", onLine);
    lines.on("close", onClose);
    lines.on("error", onError);
  });
}

function writeJsonLine(
  stream: NodeJS.WritableStream,
  payload: unknown,
): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(`${JSON.stringify(payload)}\n`, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function connectSharedRuntimeSocket(
  socketPath: string,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

export async function runSharedRuntimeStdioBridge(
  runtimeName: string,
  role: RuntimeSessionRole | "auto" = "auto",
): Promise<void> {
  const metadata = await ensureSharedRuntimeDaemon(runtimeName);
  const socket = await connectSharedRuntimeSocket(metadata.socketPath);
  const socketLines = readline.createInterface({
    input: socket,
    crlfDelay: Infinity,
  });

  const attachRequest: SharedRuntimeAttachRequest = {
    type: "attach",
    role,
  };
  await writeJsonLine(socket, attachRequest);

  const handshake = await readNextJsonLine(socketLines);
  await writeJsonLine(process.stdout, handshake);

  socketLines.on("line", (line) => {
    process.stdout.write(`${line}\n`);
  });

  socketLines.on("close", () => {
    process.exitCode = 0;
    process.exit();
  });

  socketLines.on("error", (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    process.exit();
  });

  const stdinLines = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  stdinLines.on("line", (line) => {
    if (!socket.destroyed) {
      socket.write(`${line}\n`);
    }
  });

  stdinLines.on("close", () => {
    socket.end();
  });
}

function buildAttachError(
  message: string,
): RuntimeProtocolResponse {
  return {
    operation: "runtime.info",
    ok: false,
    error: {
      code: "invalid_attach",
      message,
    },
  };
}

async function shutdownSharedRuntime(
  server: net.Server,
  sessions: Map<string, SharedRuntimeSession>,
  paths: SharedRuntimePaths,
): Promise<void> {
  for (const [sessionId, session] of sessions.entries()) {
    session.host.dispose();
    session.socket.end();
    sessions.delete(sessionId);
  }

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  await cleanupSharedRuntimeFiles(paths);
}

function resolveSessionRole(
  requestedRole: RuntimeSessionRole | "auto" | undefined,
  sessions: Map<string, SharedRuntimeSession>,
): RuntimeSessionRole {
  const hasOwner = Array.from(sessions.values()).some(
    (session) => session.role === "owner",
  );

  if (requestedRole === "auto" || requestedRole === undefined) {
    return hasOwner ? "writer" : "owner";
  }

  if (requestedRole === "owner" && hasOwner) {
    throw new Error("Shared runtime already has an active owner session");
  }

  return requestedRole;
}

export async function runSharedRuntimeDaemon(
  runtimeName: string,
  socketPath: string,
  metadataPath: string,
): Promise<void> {
  const paths = resolveSharedRuntimePaths(runtimeName);
  paths.socketPath = socketPath;
  paths.metadataPath = metadataPath;
  await fsp.mkdir(paths.runtimeDir, { recursive: true });
  await fsp.rm(paths.socketPath, { force: true });

  const server = net.createServer();
  const sessions = new Map<string, SharedRuntimeSession>();

  const disposeSession = (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }
    session.host.dispose();
    sessions.delete(sessionId);
  };

  server.on("connection", (socket) => {
    const lines = readline.createInterface({
      input: socket,
      crlfDelay: Infinity,
    });

    let attachedSession: SharedRuntimeSession | null = null;

    lines.on("line", async (line) => {
      if (!line.trim()) {
        return;
      }

      if (!attachedSession) {
        try {
          const attachPayload = JSON.parse(line) as SharedRuntimeAttachRequest;
          if (
            !isObject(attachPayload) ||
            attachPayload.type !== "attach" ||
            (attachPayload.role !== undefined &&
              attachPayload.role !== "auto" &&
              !isSessionRole(attachPayload.role))
          ) {
            await writeJsonLine(socket, buildAttachError("Invalid attach payload"));
            socket.end();
            return;
          }

          const requestedRole = attachPayload.role ?? "auto";
          const role = resolveSessionRole(requestedRole, sessions);
          const sessionId = uuid();
          const host = new RuntimeHost({
            runtimeSharing: "shared",
            runtimeName,
            sessionId,
            sessionRole: role,
            activeSessionCountProvider: () => sessions.size,
            daemonProcessId: process.pid,
            onResetRuntime: () => {
              Cadenza.reset();
              for (const session of sessions.values()) {
                session.host.resetSubscriptions();
              }
            },
          });

          attachedSession = {
            sessionId,
            role,
            socket,
            host,
          };
          sessions.set(sessionId, attachedSession);
          await writeJsonLine(
            socket,
            attachedSession.host.handshake() as unknown as Record<string, unknown>,
          );
        } catch (error) {
          await writeJsonLine(
            socket,
            buildAttachError(
              error instanceof Error ? error.message : String(error),
            ),
          );
          socket.end();
        }
        return;
      }

      try {
        const request = JSON.parse(line) as RuntimeProtocolRequest;
        const response = await attachedSession.host.handle(request);
        await writeJsonLine(
          socket,
          response as unknown as Record<string, unknown>,
        );

        const action = attachedSession.host.consumeControlAction();
        if (action === "detach") {
          socket.end();
          return;
        }

        if (action === "shutdown") {
          await shutdownSharedRuntime(server, sessions, paths);
          process.exit(0);
        }
      } catch (error) {
        await writeJsonLine(socket, {
          ok: false,
          operation: "runtime.snapshot",
          error: {
            code: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    });

    const cleanup = () => {
      if (attachedSession) {
        disposeSession(attachedSession.sessionId);
        attachedSession = null;
      }
      lines.close();
    };

    socket.on("close", cleanup);
    socket.on("error", cleanup);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(paths.socketPath, () => resolve());
  });

  const metadata: SharedRuntimeMetadata = {
    runtimeName,
    socketPath: paths.socketPath,
    metadataPath: paths.metadataPath,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  await writeMetadata(paths.metadataPath, metadata);

  const shutdown = async () => {
    await shutdownSharedRuntime(server, sessions, paths);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  await new Promise<void>(() => {});
}

export async function listSharedRuntimes(): Promise<SharedRuntimeMetadata[]> {
  if (!(await pathExists(SHARED_RUNTIME_ROOT))) {
    return [];
  }

  const entries = await fsp.readdir(SHARED_RUNTIME_ROOT, { withFileTypes: true });
  const runtimes: SharedRuntimeMetadata[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const metadata = await readMetadata(
      path.join(SHARED_RUNTIME_ROOT, entry.name, "runtime.json"),
    );
    if (!metadata) {
      continue;
    }

    if (await canConnect(metadata.socketPath)) {
      runtimes.push(metadata);
    }
  }

  runtimes.sort((left, right) => left.runtimeName.localeCompare(right.runtimeName));
  return runtimes;
}
