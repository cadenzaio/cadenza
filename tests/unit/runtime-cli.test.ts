import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

type JsonLine = Record<string, unknown>;
type SpawnedCli = {
  child: ReturnType<typeof spawn>;
  lines: readline.Interface;
};

function createCliArgs(commandArgs: string[]): string[] {
  const cliPath = path.resolve(
    process.cwd(),
    "node_modules",
    "tsx",
    "dist",
    "cli.mjs",
  );

  return [cliPath, "src/cli.ts", ...commandArgs];
}

function readNextLine(
  lines: readline.Interface,
): Promise<JsonLine> {
  return new Promise((resolve, reject) => {
    const onLine = (line: string) => {
      cleanup();
      try {
        resolve(JSON.parse(line) as JsonLine);
      } catch (error) {
        reject(error);
      }
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      lines.off("line", onLine);
      lines.off("error", onError);
    };

    lines.on("line", onLine);
    lines.on("error", onError);
  });
}

function spawnCli(commandArgs: string[]): SpawnedCli {
  const child = spawn(process.execPath, createCliArgs(commandArgs), {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  const lines = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

  return {
    child,
    lines,
  };
}

async function sendRequest(
  cli: SpawnedCli,
  payload: Record<string, unknown>,
): Promise<JsonLine> {
  cli.child.stdin.write(`${JSON.stringify(payload)}\n`);
  return readNextLine(cli.lines);
}

describe("cadenza CLI", () => {
  const children: Array<ReturnType<typeof spawn>> = [];

  afterEach(() => {
    for (const child of children) {
      child.kill();
    }
    children.length = 0;
  });

  it("prints the stdio runtime handshake first and serves request/response JSONL", async () => {
    const { child, lines } = spawnCli(["runtime", "stdio"]);
    children.push(child);

    const handshake = await readNextLine(lines);
    expect(handshake).toMatchObject({
      ready: true,
      protocol: "cadenza-runtime-jsonl",
      protocolVersion: "1",
      runtimeMode: "core",
      runtimeSharing: "isolated",
    });
    expect(handshake.supportedOperations).toContain("runtime.subscribe");

    const snapshotResponse = await sendRequest(
      { child, lines },
      {
        id: "snapshot-1",
        operation: "runtime.snapshot",
      },
    );
    expect(snapshotResponse).toMatchObject({
      id: "snapshot-1",
      operation: "runtime.snapshot",
      ok: true,
    });

    lines.close();
  });

  it("shares one named runtime across multiple stdio bridge sessions", async () => {
    const runtimeName = `runtime-cli-shared-${Date.now()}`;
    const owner = spawnCli([
      "runtime",
      "shared",
      "stdio",
      "--runtime",
      runtimeName,
    ]);
    children.push(owner.child);

    const ownerHandshake = await readNextLine(owner.lines);
    expect(ownerHandshake).toMatchObject({
      ready: true,
      runtimeSharing: "shared",
      runtimeName,
      sessionRole: "owner",
    });

    const taskResponse = await sendRequest(owner, {
      id: "owner-task",
      operation: "task.upsert",
      payload: {
        name: "SharedCliTask",
        language: "js",
        handlerSource: "() => true",
      },
    });
    expect(taskResponse).toMatchObject({
      id: "owner-task",
      operation: "task.upsert",
      ok: true,
    });

    const writer = spawnCli([
      "runtime",
      "shared",
      "stdio",
      "--runtime",
      runtimeName,
      "--role",
      "writer",
    ]);
    children.push(writer.child);

    const writerHandshake = await readNextLine(writer.lines);
    expect(writerHandshake).toMatchObject({
      ready: true,
      runtimeSharing: "shared",
      runtimeName,
      sessionRole: "writer",
    });

    const infoResponse = await sendRequest(writer, {
      id: "writer-info",
      operation: "runtime.info",
    });
    expect(infoResponse).toMatchObject({
      id: "writer-info",
      operation: "runtime.info",
      ok: true,
      result: expect.objectContaining({
        runtimeSharing: "shared",
        runtimeName,
        activeSessionCount: 2,
      }),
    });

    const sharedSnapshot = await sendRequest(writer, {
      id: "writer-snapshot",
      operation: "runtime.snapshot",
    });
    expect(sharedSnapshot).toMatchObject({
      id: "writer-snapshot",
      operation: "runtime.snapshot",
      ok: true,
      result: expect.objectContaining({
        tasks: expect.arrayContaining([
          expect.objectContaining({
            name: "SharedCliTask",
          }),
        ]),
      }),
    });

    const detachResponse = await sendRequest(writer, {
      id: "writer-detach",
      operation: "runtime.detach",
    });
    expect(detachResponse).toMatchObject({
      id: "writer-detach",
      operation: "runtime.detach",
      ok: true,
      result: expect.objectContaining({
        detached: true,
      }),
    });

    const shutdownResponse = await sendRequest(owner, {
      id: "owner-shutdown",
      operation: "runtime.shutdown",
    });
    expect(shutdownResponse).toMatchObject({
      id: "owner-shutdown",
      operation: "runtime.shutdown",
      ok: true,
      result: expect.objectContaining({
        shutdown: true,
        runtimeName,
      }),
    });
  });
});
