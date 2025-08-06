import { describe, it, expect } from "vitest";
import Cadenza from "../../src/Cadenza";

describe("Task schema", () => {
  it("should register input and output schema", async () => {
    const task = Cadenza.createTask(
      "basic task",
      (context) => {
        context.bar = "bar";
        return context;
      },
      "Some description",
      {
        inputSchema: {
          type: "object",
          properties: {
            foo: {
              type: "string",
            },
          },
          required: ["foo"],
        },
        outputSchema: {
          type: "object",
          properties: {
            bar: {
              type: "string",
            },
          },
        },
      },
    );

    // @ts-ignore
    expect(task.inputContextSchema).toBeDefined();
    // @ts-ignore
    expect(task.outputContextSchema).toBeDefined();
  });

  it("should validate input and output schema", async () => {
    const task = Cadenza.createTask(
      "basic task",
      (context) => {
        context.bar = "bar";
        return context;
      },
      "Some description",
      {
        inputSchema: {
          type: "object",
          properties: {
            foo: {
              type: "string",
            },
          },
          required: ["foo"],
        },
        outputSchema: {
          type: "object",
          properties: {
            bar: {
              type: "string",
            },
            foo: {
              type: "string",
            },
          },
        },
        validateInputContext: true,
        validateOutputContext: true,
      },
    );

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.elements[0].data.context).not.toHaveProperty(
      "__error",
    );
  });

  it("should fail validation of input schema", async () => {
    const task = Cadenza.createTask(
      "basic task",
      (context) => {
        context.bar = "bar";
        return context;
      },
      "Some description",
      {
        inputSchema: {
          type: "object",
          properties: {
            foo: {
              type: "string",
            },
          },
          required: ["foo"],
        },
        outputSchema: {
          type: "object",
          properties: {
            bar: {
              type: "string",
            },
            foo: {
              type: "string",
            },
          },
        },
        validateInputContext: true,
        validateOutputContext: true,
      },
    );

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task, { foo: 1 });

    const result = run.export();

    expect(result.__graph.elements[0].data.context.__error).toBe(
      "Node error: {\"context.foo\":\"Expected 'string' for 'foo', got 'number'\"}",
    );
  });

  it("should fail validation of output schema", async () => {
    const task = Cadenza.createTask(
      "basic task",
      (context) => {
        context.bar = 1;
        return context;
      },
      "Some description",
      {
        inputSchema: {
          type: "object",
          properties: {
            foo: {
              type: "string",
            },
          },
          required: ["foo"],
        },
        outputSchema: {
          type: "object",
          properties: {
            bar: {
              type: "string",
            },
            foo: {
              type: "string",
            },
          },
        },
        validateInputContext: true,
        validateOutputContext: true,
      },
    );

    const runner = Cadenza.runner;
    runner.setDebug(true);
    const run = await runner.run(task, { foo: "bar" });

    const result = run.export();

    expect(result.__graph.elements[0].data.context.__error).toBe(
      "Node error: {\"context.bar\":\"Expected 'string' for 'bar', got 'number'\"}",
    );
  });
});
