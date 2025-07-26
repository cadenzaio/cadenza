import { describe, it, expect } from "vitest";
import Cadenza from "../../Cadenza";

describe("Basic Task", () => {
  it("should run task with context", async () => {
    const task = Cadenza.createTask("basic task", (_) => {
      return true;
    });

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(1);
    expect(result.__graph.elements[0].data.context).toHaveProperty(
      "foo",
      "bar",
    );
    expect(result.__graph.elements[0].data.context).toHaveProperty(
      "__nextNodes",
      [],
    );
  });

  it("should be able to update context", async () => {
    const task = Cadenza.createTask("addFoo", (ctx) => {
      ctx.foo = "bar";
      return ctx;
    });

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task, {});

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(1);
    expect(result.__graph.elements[0].data.context).toHaveProperty(
      "foo",
      "bar",
    );
  });

  it("should be able to update context when it is returned", async () => {
    const task = Cadenza.createTask("addFoo", (ctx) => {
      ctx.foo = "foo";
      return ctx;
    });

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(1);
    expect(result.__graph.elements[0].data.context).toHaveProperty(
      "foo",
      "foo",
    );
  });

  it("should not update context when it is not returned", async () => {
    const task = Cadenza.createTask("notAddFoo", (ctx) => {
      ctx.foo = "bar";
      return true;
    });

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task, {});

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(1);
    expect(result.__graph.elements[0].data.context).not.toHaveProperty(
      "foo",
      "bar",
    );
  });

  it("should run task even when returning false", async () => {
    const task = Cadenza.createTask("stop task", (_) => {
      return false;
    });

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task, {});

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(1);
  });

  it("should run task even when returning undefined", async () => {
    const task = Cadenza.createTask("undefined task", (_) => {
      return;
    });

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task, {});

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(1);
  });

  it("should run task even when throwing an error", async () => {
    const task = Cadenza.createTask("undefined task", (_) => {
      throw new Error("error");
    });

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task, {});

    const result = run.export();

    expect(result.__graph.numberOfNodes).toBe(1);
    expect(result.__graph.elements[0].data.context).toHaveProperty(
      "error",
      "Node error: Error: error",
    );
    expect(result.__graph.elements[0].data.context).toHaveProperty(
      "__error",
      "Node error: Error: error",
    );
  });
});
