import { beforeEach, describe, expect, it } from "vitest";
import Cadenza from "../../src/Cadenza";
import { sleep } from "../../src/utils/promise";

function uniqueName(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

describe("GraphRunner observability boundary", () => {
  beforeEach(() => {
    try {
      Cadenza.reset();
    } catch {
      // Ignore first-run reset errors before bootstrap.
    }

    Cadenza.bootstrap();
  });

  it("does not emit execution trace runner signals for meta tasks", async () => {
    let traceCount = 0;
    let routineCount = 0;

    Cadenza.createMetaTask(uniqueName("observe-meta-trace"), () => {
      traceCount += 1;
      return true;
    }).doOn("meta.runner.new_trace");

    Cadenza.createMetaTask(uniqueName("observe-meta-routine"), () => {
      routineCount += 1;
      return true;
    }).doOn("meta.runner.added_tasks");

    Cadenza.run(Cadenza.createMetaTask(uniqueName("meta-task"), () => true), {});

    await sleep(50);

    expect(traceCount).toBe(0);
    expect(routineCount).toBe(0);
  });

  it("still emits execution trace runner signals for business tasks", async () => {
    let traceCount = 0;
    let routineCount = 0;

    Cadenza.createMetaTask(uniqueName("observe-business-trace"), () => {
      traceCount += 1;
      return true;
    }).doOn("meta.runner.new_trace");

    Cadenza.createMetaTask(uniqueName("observe-business-routine"), () => {
      routineCount += 1;
      return true;
    }).doOn("meta.runner.added_tasks");

    Cadenza.run(Cadenza.createTask(uniqueName("business-task"), () => true), {});

    await sleep(50);

    expect(traceCount).toBe(1);
    expect(routineCount).toBe(1);
  });
});
