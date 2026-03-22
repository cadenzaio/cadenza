import { beforeEach, describe, expect, it } from "vitest";
import Cadenza from "../../src/Cadenza";

describe("Task intent metadata", () => {
  beforeEach(() => {
    try {
      Cadenza.reset();
    } catch {
      // Ignore first-run resets before bootstrap.
    }

    Cadenza.setMode("debug");
  });

  it("emits local task intent association metadata from respondsTo()", async () => {
    let payload: Record<string, unknown> | undefined;

    Cadenza.createMetaTask("Capture task intent metadata", (ctx) => {
      payload = ctx;
      return true;
    }).doOn("meta.task.intent_associated");

    Cadenza.createMetaTask("Intent metadata contract task", (ctx) => ctx).respondsTo(
      "orders-contract-sync",
    );

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(payload).toMatchObject({
      data: {
        intentName: "orders-contract-sync",
        taskName: "Intent metadata contract task",
        taskVersion: 1,
      },
    });
  });
});
