import { describe, it, expect, beforeEach } from "vitest";
import Cadenza from "../../src/Cadenza";

describe("Task schema", () => {
  beforeEach(() => {
    Cadenza.setMode("debug");
  });

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

  it("should validate against schema map variants", () => {
    const task = Cadenza.createTask(
      "schema map task",
      (context) => context,
      "Schema map validation",
      {
        inputSchema: {
          "intent-alpha": {
            type: "object",
            properties: {
              alpha: { type: "string" },
            },
            required: ["alpha"],
          },
          "intent-beta": {
            type: "object",
            properties: {
              beta: { type: "number" },
            },
            required: ["beta"],
          },
        },
        validateInputContext: true,
      },
    );

    expect(task.validateInput({ alpha: "ok" })).toBe(true);
    expect(task.validateInput({ beta: 1 })).toBe(true);
    expect(task.validateInput({ beta: "1" })).toHaveProperty("errored", true);
  });

  it("should merge multiple intent schemas on respondsTo", () => {
    Cadenza.defineIntent({
      name: "intent-schema-alpha",
      input: {
        type: "object",
        properties: {
          alpha: { type: "string" },
        },
        required: ["alpha"],
      },
      output: {
        type: "object",
        properties: {
          alphaResult: { type: "string" },
        },
      },
    });
    Cadenza.defineIntent({
      name: "intent-schema-beta",
      input: {
        type: "object",
        properties: {
          beta: { type: "number" },
        },
        required: ["beta"],
      },
      output: {
        type: "object",
        properties: {
          betaResult: { type: "number" },
        },
      },
    });

    const task = Cadenza.createTask(
      "responds to schema map task",
      (context) => context,
      "RespondsTo schema merge",
      {
        validateInputContext: true,
      },
    ).respondsTo("intent-schema-alpha", "intent-schema-beta");

    expect(task.inputContextSchema).toMatchObject({
      "intent-schema-alpha": {
        type: "object",
      },
      "intent-schema-beta": {
        type: "object",
      },
    });
    expect(task.outputContextSchema).toMatchObject({
      "intent-schema-alpha": {
        type: "object",
      },
      "intent-schema-beta": {
        type: "object",
      },
    });
    expect(task.validateInput({ alpha: "ok" })).toBe(true);
    expect(task.validateInput({ beta: 2 })).toBe(true);
    expect(task.validateInput({ gamma: true })).toHaveProperty("errored", true);
  });
});
