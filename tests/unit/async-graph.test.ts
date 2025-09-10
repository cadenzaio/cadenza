import { describe, it, expect, beforeEach } from "vitest";
import Cadenza from "../../src/Cadenza";
import { sleep } from "../../src/utils/promise";

describe("Async Graph", () => {
  beforeEach(() => {
    Cadenza.setMode("debug");
  });

  it("should run async graph with context", async () => {
    const task1 = Cadenza.createTask("task1", async () => true);
    const task2 = Cadenza.createTask("task2", async () => sleep(100));

    task1.then(task2);

    const runner = Cadenza.runner;
    const run = await runner.run(task1, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(2);
    expect(result.__graph.elements[2].data.context).toHaveProperty(
      "foo",
      "bar",
    );
  });

  it("should run async graph layers in right order", async () => {
    const asyncFunction = async (_: any) => {
      await sleep(50);
      return true;
    };
    const task1 = Cadenza.createTask("task1", asyncFunction);
    const task2 = Cadenza.createTask("task2", asyncFunction);
    const task3 = Cadenza.createTask("task3", asyncFunction);

    task1.then(task2.then(task3));

    const runner = Cadenza.runner;
    const run = await runner.run(task1, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(3);
    expect(result.__graph.elements[2].label).toBe("task2");
    expect(result.__graph.elements[4].label).toBe("task3");
  });

  it("should await all tasks of same graph execution on one layer before running next", async () => {
    const asyncFunction = async (_: any) => {
      await sleep(50);
      return true;
    };
    const task1 = Cadenza.createTask("task1", asyncFunction);
    const task2 = Cadenza.createTask("task2", asyncFunction);
    const task3 = Cadenza.createTask("task3", asyncFunction);
    const task4 = Cadenza.createTask("task4", asyncFunction);

    task1.then(task2.then(task4), task3);

    const runner = Cadenza.runner;
    const run = await runner.run(task1, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(4);
    expect(result.__graph.elements[5].data.executionEnd).toBeLessThanOrEqual(
      result.__graph.elements[6].data.executionStart,
    );
  });

  it("should handle several graph executions simultaneously", async () => {
    const asyncFunction = async (_: any) => {
      await sleep(50);
      return true;
    };
    const task1 = Cadenza.createTask("task1", asyncFunction);
    const task2 = Cadenza.createTask("task2", asyncFunction);
    const task3 = Cadenza.createTask("task3", asyncFunction);
    const task4 = Cadenza.createTask("task4", asyncFunction);

    task1.then(task2.then(task4), task3);

    const runner = Cadenza.runner;
    const run = runner.run(task1, { foo: 1 });
    await sleep(75);
    runner.run(task1, { foo: 2 });
    await sleep(50);
    runner.run(task2, { foo: 3 });

    const [graphRun] = await Promise.all([run]);

    const result = graphRun.export();

    expect(result.__graph.numberOfNodes).toBe(10);
  });

  it("should respect the concurrency setting", async () => {
    const asyncFunction = async (_: any) => {
      await sleep(50);
      return true;
    };
    const task1 = Cadenza.createTask("task1", asyncFunction, "", {
      concurrency: 0,
    });
    const task2 = Cadenza.createTask("task2", asyncFunction, "", {
      concurrency: 1,
    });
    const task3 = Cadenza.createTask("task3", asyncFunction, "", {
      concurrency: 2,
    });
    const task4 = Cadenza.createTask("task4", asyncFunction, "", {
      concurrency: 0,
    });

    task1.then(task2.then(task4), task3);

    const runner = Cadenza.runner;
    const run = runner.run(task1, { foo: 1 });
    await sleep(10);
    runner.run(task1, { foo: 2 });
    await sleep(10);
    runner.run(task1, { foo: 3 });

    const [graphRun] = await Promise.all([run]);

    const result = graphRun.export();

    expect(result.__graph.numberOfNodes).toBe(12);
    expect(result.__graph.elements[11].data.executionEnd).toBeLessThanOrEqual(
      result.__graph.elements[17].data.executionStart,
    );
    expect(
      result.__graph.elements[11].data.executionEnd,
    ).toBeGreaterThanOrEqual(result.__graph.elements[14].data.executionStart);
    expect(result.__graph.elements[9].data.executionEnd).toBeLessThanOrEqual(
      result.__graph.elements[12].data.executionStart,
    );
    expect(result.__graph.elements[12].data.executionEnd).toBeLessThanOrEqual(
      result.__graph.elements[15].data.executionStart,
    );
  });

  it("should be able to execute synchronous graphs and asynchronous tasks simultaneously", async () => {
    const asyncFunction = async (_: any) => {
      await sleep(50);
      return true;
    };
    const task1 = Cadenza.createTask("task1", asyncFunction);
    const task2 = Cadenza.createTask("task2", asyncFunction);
    const task3 = Cadenza.createTask("task3", asyncFunction);
    const task4 = Cadenza.createTask("task4", asyncFunction);

    const task5 = Cadenza.createTask("task5", (_) => true);
    const task6 = Cadenza.createTask("task6", (_) => true);
    const task7 = Cadenza.createTask("task7", (_) => true);
    const task8 = Cadenza.createTask("task8", (_) => true);
    const task9 = Cadenza.createTask("task9", (_) => true);
    const task10 = Cadenza.createTask("task10", (_) => true);
    const task11 = Cadenza.createTask("task11", (_) => true);

    task1.then(task2.then(task4), task3);

    const asyncRoutine = Cadenza.createRoutine("asyncRoutine", [task1]);

    task5.then(task6.then(task7), task8.then(task9.then(task10, task11)));

    const syncRoutine = Cadenza.createRoutine("syncRoutine", [task5]);

    const runner = Cadenza.runner;
    const run = runner.run(asyncRoutine, { foo: 1 });
    await sleep(50);
    runner.run(syncRoutine, { foo: 2 });
    await sleep(10);
    runner.run(syncRoutine, { foo: 3 });

    const [graphRun] = await Promise.all([run]);

    const result = graphRun.export();

    const elements = result.__graph.elements;
    const elementsLength = elements.length;

    expect(result.__graph.numberOfNodes).toBe(18);
    expect(elements[elementsLength - 1].data.executionEnd).toBeLessThan(
      elements[elementsLength - 5].data.executionEnd,
    );
  });

  it("should be able to split a branch into several sub-graphs", async () => {
    const task1 = Cadenza.createTask("task1", (_) => true);
    const task2 = Cadenza.createTask("task2", async function* (_) {
      await sleep(100);
      for (let i = 0; i < 5; i++) {
        yield { foo: i };
      }
    });
    const task3 = Cadenza.createTask("task3", (_) => true);
    const task4 = Cadenza.createTask("task4", (_) => true);
    const task5 = Cadenza.createTask("task5", (_) => true);

    task1.then(task2.then(task4, task5), task3);

    const runner = Cadenza.runner;
    const run = await runner.run(task1, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(13);
  });

  it("should be able to throttle asynchronous tasks", async () => {
    const asyncFunction = async (_: any) => {
      await sleep(50);
      return true;
    };
    const task1 = Cadenza.createTask("task1", asyncFunction);
    const task2 = Cadenza.createThrottledTask("task2", asyncFunction);
    const task3 = Cadenza.createTask("task3", asyncFunction);
    const task4 = Cadenza.createTask("task4", asyncFunction);

    const task5 = Cadenza.createTask("task5", asyncFunction);
    const task6 = Cadenza.createThrottledTask("task6", asyncFunction);

    task1.then(task2.then(task4), task3);

    const routine1 = Cadenza.createRoutine("routine1", [task1]);

    task5.then(task6);

    const routine2 = Cadenza.createRoutine("routine2", [task5]);

    const runner = Cadenza.runner;
    runner.setStrategy(Cadenza.runStrategy.PARALLEL);
    runner.setDebug(true);

    const run = runner.run(routine1, { foo: 1 });
    await sleep(5);
    runner.run(routine2, { foo: 2 });

    const [graphRun] = await Promise.all([run]);

    const result = graphRun.export();

    expect(result.__graph.numberOfNodes).toBe(6);
    expect(
      result.__graph.elements[8].data.executionEnd -
        result.__graph.elements[5].data.executionEnd,
    ).toBeGreaterThanOrEqual(49);
  });

  it("should be able to debounce tasks", async () => {
    const task1 = Cadenza.createTask("task1", (_) => true);
    const task2 = Cadenza.createDebounceTask(
      "task2",
      (context) => {
        context.executed = true;
        return context;
      },
      undefined,
      100,
    );
    const task3 = Cadenza.createTask("task3", (_) => true);
    const task4 = Cadenza.createTask("task4", (_) => true);

    task1.then(task2.then(task4), task3);

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = runner.run(task1, { foo: 1 });
    await sleep(10);
    runner.run(task1, { foo: 2 });
    const [graphRun] = await Promise.all([run]);

    const result = graphRun.export();

    expect(result.__graph.numberOfNodes).toBe(7);
    expect(result.__graph.elements[6].data.context).not.toHaveProperty(
      "executed",
    );
    expect(result.__graph.elements[8].data.context).toHaveProperty("executed");
  });

  it("should retry a task", async () => {
    let retries = 0;
    const task1 = Cadenza.createTask("task1", (context) => {
      return true;
    });

    const task2 = Cadenza.createTask(
      "task2",
      async (context) => {
        if (retries < 2) {
          await sleep(10);
          retries++;
          throw new Error("error");
        }

        return true;
      },
      "",
      { retryCount: 2 },
    );

    task1.then(task2);

    const runner = Cadenza.runner;
    const run = await runner.run(task1, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(2);
    expect(result.__graph.elements[2].data.context).not.toHaveProperty("error");
    expect(result.__graph.elements[2].data.context.__retries).toBe(2);
  });

  it("should correctly handle progress callbacks", async () => {
    // TODO
  });

  it("should not add too much latency overhead", () => {
    // TODO
  });
});
