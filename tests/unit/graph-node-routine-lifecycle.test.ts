import { beforeEach, describe, expect, it, vi } from "vitest";
import Cadenza from "../../src/Cadenza";
import GraphContext from "../../src/graph/context/GraphContext";
import GraphNode from "../../src/graph/execution/GraphNode";
import { sleep } from "../../src/utils/promise";

function uniqueName(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

describe("GraphNode routine lifecycle metrics", () => {
  beforeEach(() => {
    try {
      Cadenza.reset();
    } catch {
      // Ignore first-run reset errors before bootstrap.
    }

    Cadenza.bootstrap();
  });

  it("does not emit routine lifecycle metrics for meta tasks", async () => {
    let started = 0;
    let ended = 0;

    Cadenza.createMetaTask(uniqueName("observe-start-meta"), () => {
      started += 1;
      return true;
    }).doOn("meta.node.started_routine_execution");

    Cadenza.createMetaTask(uniqueName("observe-end-meta"), () => {
      ended += 1;
      return true;
    }).doOn("meta.node.ended_routine_execution");

    Cadenza.run(Cadenza.createMetaTask(uniqueName("meta-task"), () => true), {});

    await sleep(100);

    expect(started).toBe(0);
    expect(ended).toBe(0);
  });

  it("does not emit routine lifecycle metrics for hidden tasks", async () => {
    let started = 0;
    let ended = 0;

    Cadenza.createMetaTask(uniqueName("observe-start-hidden"), () => {
      started += 1;
      return true;
    }).doOn("meta.node.started_routine_execution");

    Cadenza.createMetaTask(uniqueName("observe-end-hidden"), () => {
      ended += 1;
      return true;
    }).doOn("meta.node.ended_routine_execution");

    Cadenza.run(
      Cadenza.createTask(uniqueName("hidden-task"), () => true, "", {
        isHidden: true,
      }),
      {},
    );

    await sleep(100);

    expect(started).toBe(0);
    expect(ended).toBe(0);
  });

  it("does not emit routine lifecycle metrics for inquiry routines", async () => {
    let started = 0;
    let ended = 0;

    Cadenza.createMetaTask(uniqueName("observe-start-inquiry"), () => {
      started += 1;
      return true;
    }).doOn("meta.node.started_routine_execution");

    Cadenza.createMetaTask(uniqueName("observe-end-inquiry"), () => {
      ended += 1;
      return true;
    }).doOn("meta.node.ended_routine_execution");

    Cadenza.run(Cadenza.createTask(uniqueName("inquiry-task"), () => true), {
      __isInquiry: true,
    });

    await sleep(25);

    expect(started).toBe(0);
    expect(ended).toBe(0);
  });

  it("does not emit routine lifecycle metrics for deputy routines", async () => {
    let started = 0;
    let ended = 0;

    Cadenza.createMetaTask(uniqueName("observe-start-deputy"), () => {
      started += 1;
      return true;
    }).doOn("meta.node.started_routine_execution");

    Cadenza.createMetaTask(uniqueName("observe-end-deputy"), () => {
      ended += 1;
      return true;
    }).doOn("meta.node.ended_routine_execution");

    Cadenza.run(Cadenza.createTask(uniqueName("deputy-task"), () => true), {
      __isDeputy: true,
    });

    await sleep(25);

    expect(started).toBe(0);
    expect(ended).toBe(0);
  });

  it("emits a matching end metric when a business routine finishes in a hidden task", async () => {
    const visibleTask = Cadenza.createTask(
      uniqueName("visible-business-task"),
      () => true,
    );
    const hiddenFinalizeTask = Cadenza.createTask(
      uniqueName("hidden-finalize-task"),
      () => true,
      "",
      { isHidden: true },
    );

    const routineExecId = uniqueName("routine");
    const startNode = new GraphNode(
      visibleTask,
      new GraphContext({}),
      routineExecId,
      [],
    );
    const startSpy = vi.spyOn(startNode, "emitMetricsWithMetadata");

    startNode.start();

    expect(
      startSpy.mock.calls.some(
        ([signalName]) => signalName === "meta.node.started_routine_execution",
      ),
    ).toBe(true);

    const endNode = new GraphNode(
      hiddenFinalizeTask,
      new GraphContext({ ...startNode.context.getFullContext() }),
      routineExecId,
      [startNode],
    );
    endNode.executionStart = Date.now();
    endNode.graphComplete = true;
    const endSpy = vi.spyOn(endNode, "emitMetricsWithMetadata");

    endNode.end();

    expect(
      endSpy.mock.calls.some(
        ([signalName]) => signalName === "meta.node.ended_routine_execution",
      ),
    ).toBe(true);
  });
});
