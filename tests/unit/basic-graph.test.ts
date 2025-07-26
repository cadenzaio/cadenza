import { describe, it, expect } from "vitest";
import Cadenza from "../../src/Cadenza";
import { sleep } from "../../src/utils/promise";

describe("Basic Graph", () => {
  it("should define graph with .then() method", async () => {
    const task1 = Cadenza.createTask("task1", (_) => true);
    const task2 = Cadenza.createTask("task2", (_) => true);
    const task3 = Cadenza.createTask("task3", (_) => true);

    task1.then(task2, task3);

    const nextMap = task1.mapNext((t) => t.name);

    expect(nextMap).toHaveLength(2);
    expect(nextMap[0]).toBe("task2");
    expect(nextMap[1]).toBe("task3");
  });

  it("should define graph with .doAfter() method", async () => {
    const task1 = Cadenza.createTask("task1", (_) => true);
    const task2 = Cadenza.createTask("task2", (_) => true);
    const task3 = Cadenza.createTask("task3", (_) => true);

    task2.doAfter(task1);
    task3.doAfter(task1);

    const nextMap = task1.mapNext((t) => t.name);

    expect(nextMap).toHaveLength(2);
    expect(nextMap[0]).toBe("task2");
    expect(nextMap[1]).toBe("task3");
  });

  it("should run graph with context", async () => {
    const task1 = Cadenza.createTask("task1", (_) => true);
    const task2 = Cadenza.createTask("task2", (_) => true);

    task1.then(task2);

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task1, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(2);
    expect(result.__graph.elements[2].data.context).toHaveProperty(
      "foo",
      "bar",
    );
  });

  it("should pass updated context to next task", async () => {
    const task1 = Cadenza.createTask("task1", (ctx) => {
      ctx.test = "foo";
      return ctx;
    });
    const task2 = Cadenza.createTask("task2", (_) => true);

    task1.then(task2);

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task1, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(2);
    expect(result.__graph.elements[2].data.context).toHaveProperty(
      "foo",
      "bar",
    );
    expect(result.__graph.elements[2].data.context).toHaveProperty(
      "test",
      "foo",
    );
  });

  it("should not work with async task functions when using sequential strategy", async () => {
    const task1 = Cadenza.createTask("task1", async (_) => true);
    const task2 = Cadenza.createTask("task2", (_) => sleep(100));
    task1.then(task2);

    const runner = Cadenza.runner;
    runner.setDebug(true);
    runner.setStrategy(Cadenza.runStrategy.SEQUENTIAL);
    const run = await runner.run(task1, { foo: "bar" });
    const result = run.export();
    expect(result.__graph.numberOfNodes).toBe(1);
  });

  it("should be able to branch tasks", async () => {
    const task1 = Cadenza.createTask("task1", (_) => true);
    const task2 = Cadenza.createTask("task2", (_) => true);
    const task3 = Cadenza.createTask("task3", (_) => true);

    task1.then(task2, task3);

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task1, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(3);
    expect(result.__graph.elements[3].data.context).toHaveProperty(
      "foo",
      "bar",
    );
    expect(result.__graph.elements[4].data.context).toHaveProperty(
      "foo",
      "bar",
    );
  });

  it("should be able to branch tasks on multiple layers", async () => {
    const task1 = Cadenza.createTask("task1", (_) => true);
    const task2 = Cadenza.createTask("task2", (_) => true);
    const task3 = Cadenza.createTask("task3", (_) => true);
    const task4 = Cadenza.createTask("task4", (_) => true);
    const task5 = Cadenza.createTask("task5", (_) => true);
    const task6 = Cadenza.createTask("task6", (_) => true);
    const task7 = Cadenza.createTask("task7", (_) => true);

    task1.then(task2.then(task4, task5), task3.then(task6, task7));

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task1, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(7);
  });

  it("should be able to merge branches with unique task", async () => {
    const task1 = Cadenza.createTask("task1", (_) => true);
    const task2 = Cadenza.createTask("task2", (_) => true);
    const task3 = Cadenza.createTask("task3", (_) => true);
    const task4 = Cadenza.createTask("task4", (_) => true);
    const task5 = Cadenza.createTask("task5", (_) => true);
    const task6 = Cadenza.createTask("task6", (_) => true);
    const task7 = Cadenza.createTask("task7", (_) => true);
    const task8 = Cadenza.createUniqueTask("task8", (_) => true);
    const task9 = Cadenza.createTask("task9", (_) => true);

    task1.then(
      task2.then(task4.then(task8.then(task9)), task5.then(task8)),
      task3.then(task6.then(task8), task7.then(task8)),
    );

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task1, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(9);
    expect(result.__graph.elements[14].data.context).toHaveProperty(
      "joinedContexts",
    );
    expect(
      result.__graph.elements[14].data.context.joinedContexts,
    ).toHaveLength(4);
  });

  it("should be able to split a branch into several sub-graphs", async () => {
    const task1 = Cadenza.createTask("task1", (_) => true);
    const task2 = Cadenza.createTask("task2", function* (_) {
      for (let i = 0; i < 5; i++) {
        yield { foo: i };
      }
    });
    const task3 = Cadenza.createTask("task3", (_) => true);
    const task4 = Cadenza.createTask("task4", (_) => true);
    const task5 = Cadenza.createTask("task5", (_) => true);

    task1.then(task2.then(task4, task5), task3);

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task1, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(13);
  });

  it("should be able to merge sub-graphs with unique task", async () => {
    const task1 = Cadenza.createTask("task1", (_) => true);
    const task2 = Cadenza.createTask("task2", function* (_) {
      for (let i = 0; i < 5; i++) {
        yield { foo: i };
      }
    });
    const task3 = Cadenza.createTask("task3", (_) => true);
    const task4 = Cadenza.createTask("task4", (_) => true);
    const task5 = Cadenza.createTask("task5", (_) => true);
    const task6 = Cadenza.createUniqueTask("task6", (_) => true);
    const task7 = Cadenza.createTask("task7", (_) => true);

    task1.then(
      task2.then(task4.then(task6.then(task7)), task5.then(task6)),
      task3,
    );

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task1, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(15);
    expect(result.__graph.elements[26].data.context).toHaveProperty(
      "joinedContexts",
    );
    expect(
      result.__graph.elements[26].data.context.joinedContexts,
    ).toHaveLength(10);
  });

  it("should be able to create and run routines with context", async () => {
    const task1 = Cadenza.createTask("task1", (_) => true);
    const task2 = Cadenza.createTask("task2", (_) => true);
    const task3 = Cadenza.createTask("task3", (_) => true);

    task1.then(task2);
    task2.then(task3);

    const routine = Cadenza.createRoutine(
      "Routine 1",
      [task1],
      "Test routine description",
    );

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(routine, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(3);
  });

  it("should be able to filter out branch executions by returning false", async () => {
    const task1 = Cadenza.createTask("task1", (_) => true);
    const task2 = Cadenza.createTask("task2", (_) => true);
    const task3 = Cadenza.createTask("task3", (_) => false);
    const task4 = Cadenza.createTask("task4", (_) => true);
    const task5 = Cadenza.createTask("task5", (_) => true);
    const task6 = Cadenza.createTask("task6", (_) => true);
    const task7 = Cadenza.createTask("task7", (_) => true);

    task1.then(task2.then(task4, task5), task3.then(task6, task7));

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task1, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(5);
  });

  it("should be able to filter out branch executions by returning undefined", async () => {
    const task1 = Cadenza.createTask("task1", (_) => true);
    const task2 = Cadenza.createTask("task2", (_) => undefined);
    const task3 = Cadenza.createTask("task3", (_) => true);
    const task4 = Cadenza.createTask("task4", (_) => true);
    const task5 = Cadenza.createTask("task5", (_) => true);
    const task6 = Cadenza.createTask("task6", (_) => true);
    const task7 = Cadenza.createTask("task7", (_) => true);

    task1.then(task2.then(task4, task5), task3.then(task6, task7));

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task1, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(5);
  });
});
