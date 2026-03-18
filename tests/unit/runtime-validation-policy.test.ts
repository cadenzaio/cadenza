import { beforeEach, describe, expect, it, vi } from "vitest";
import Cadenza from "../../src/Cadenza";

function uniqueName(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

describe("Runtime validation policy", () => {
  beforeEach(() => {
    Cadenza.reset();
    Cadenza.setMode("production");
  });

  it("enforces business input validation from runtime policy", () => {
    Cadenza.setRuntimeValidationPolicy({
      businessInput: "enforce",
    });

    const task = Cadenza.createTask(uniqueName("business-validate"), (ctx) => ctx, "", {
      inputSchema: {
        type: "object",
        properties: {
          foo: { type: "string" },
        },
        required: ["foo"],
      },
    });

    expect(task.validateInput({ foo: 1 }, {})).toMatchObject({
      errored: true,
      __error: "Input context validation failed",
    });
  });

  it("enforces meta input validation without affecting business tasks", () => {
    Cadenza.setRuntimeValidationPolicy({
      metaInput: "enforce",
    });

    const businessTask = Cadenza.createTask(
      uniqueName("business-no-enforce"),
      (ctx) => ctx,
      "",
      {
        inputSchema: {
          type: "object",
          properties: {
            foo: { type: "string" },
          },
          required: ["foo"],
        },
      },
    );

    const metaTask = Cadenza.createMetaTask(
      uniqueName("meta-enforce"),
      (ctx) => ctx,
      "",
      {
        inputSchema: {
          type: "object",
          properties: {
            __validationTarget: { type: "string" },
          },
          required: ["__validationTarget"],
        },
      },
    );

    expect(businessTask.validateInput({ foo: 1 }, {})).toBe(true);
    expect(
      metaTask.validateInput(
        { __validationTarget: 1 },
        { __validationTarget: 1 },
      ),
    ).toMatchObject({
      errored: true,
      __error: "Input context validation failed",
    });
  });

  it("warns once for missing schemas when enabled", async () => {
    Cadenza.setRuntimeValidationPolicy({
      businessInput: "warn",
      warnOnMissingBusinessInputSchema: true,
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const task = Cadenza.createTask(
      uniqueName("missing-schema"),
      (ctx) => ({ ...ctx, ok: true }),
    );

    await Cadenza.runner.run(task, { foo: "bar" });
    await Cadenza.runner.run(task, { foo: "baz" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0] ?? "")).toContain(
      "Missing input schema",
    );

    warnSpy.mockRestore();
  });

  it("can enforce validation only for a scoped subflow starting at a task", async () => {
    const startTaskName = uniqueName("scope-start");
    const validateTaskName = uniqueName("scope-validate");

    Cadenza.upsertRuntimeValidationScope({
      id: uniqueName("scope"),
      startTaskNames: [startTaskName],
      policy: {
        businessInput: "enforce",
      },
    });

    const startTask = Cadenza.createTask(startTaskName, () => ({
      foo: 123,
    }));

    const validateTask = Cadenza.createTask(
      validateTaskName,
      (ctx) => ctx,
      "",
      {
        inputSchema: {
          type: "object",
          properties: {
            foo: { type: "string" },
          },
          required: ["foo"],
        },
      },
    );

    startTask.then(validateTask);

    Cadenza.runner.setDebug(true);
    const run = await Cadenza.runner.run(startTask, {});
    const result = run.export();
    const validationNode = result.__graph.elements.find(
      (element: any) => element.label === validateTaskName,
    );

    expect(validationNode?.data?.context?.__error).toBe(
      `Node error: {"context.foo":"Expected 'string' for 'foo', got 'number'"}`,
    );
  });
});
