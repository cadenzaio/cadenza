import { beforeEach, describe, expect, it } from "vitest";
import Cadenza from "../../src/Cadenza";
import { sleep } from "../../src/utils/promise";

function uniqueName(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

describe("Inquiry Broker", () => {
  beforeEach(() => {
    Cadenza.setMode("production");
  });

  it("resolves partial results when inquiry times out", async () => {
    const intentName = uniqueName("intent-timeout");
    const fastTaskName = uniqueName("task-fast");
    const slowTaskName = uniqueName("task-slow");

    Cadenza.createTask(fastTaskName, () => ({ fast: true })).respondsTo(
      intentName,
    );

    Cadenza.createTask(slowTaskName, async () => {
      await sleep(80);
      return { slow: true };
    }).respondsTo(intentName);

    const result = await Cadenza.inquire(intentName, {}, { timeout: 20 });

    expect(result.fast).toBe(true);
    expect(result.slow).toBeUndefined();
    expect(result.errored).toBe(true);
    expect(result.timedOut).toBe(true);
    expect(result.pendingTasks).toContain(slowTaskName);
    expect(result.__inquiryMeta.pendingTasks).toContain(slowTaskName);
  });

  it("rejects on timeout when configured", async () => {
    const intentName = uniqueName("intent-reject-timeout");

    Cadenza.createTask(uniqueName("task-fast"), () => ({ fast: true })).respondsTo(
      intentName,
    );

    Cadenza.createTask(uniqueName("task-slow"), async () => {
      await sleep(80);
      return { slow: true };
    }).respondsTo(intentName);

    await expect(
      Cadenza.inquire(intentName, {}, { timeout: 20, rejectOnTimeout: true }),
    ).rejects.toMatchObject({
      errored: true,
      timedOut: true,
    });
  });

  it("unsubscribes destroyed tasks from inquiry observers", () => {
    const intentName = uniqueName("intent-destroy");
    const task = Cadenza.createTask(uniqueName("task-observer"), () => ({
      ok: true,
    })).respondsTo(intentName);

    expect(
      Cadenza.inquiryBroker.inquiryObservers
        .get(intentName)
        ?.tasks.has(task),
    ).toBe(true);

    task.destroy();

    expect(Cadenza.inquiryBroker.inquiryObservers.get(intentName)).toBeUndefined();
  });

  it("reset clears inquiry and transient signal broker state", () => {
    const observedSignalName = uniqueName("signal-observed-reset");
    const transientSignalName = uniqueName("signal-transient-reset");
    const intentName = uniqueName("intent-reset");
    const groupId = uniqueName("group");

    Cadenza.createTask(uniqueName("task-signal-observer"), () => true).doOn(
      observedSignalName,
    );
    Cadenza.createTask(uniqueName("task-intent-observer"), () => true).respondsTo(
      intentName,
    );

    Cadenza.signalBroker.debounce(transientSignalName, { value: 1 }, { delayMs: 1000 });
    Cadenza.signalBroker.schedule(transientSignalName, { value: 2 }, { delayMs: 1000 });
    Cadenza.signalBroker.throttle(transientSignalName, { value: 3 }, {
      delayMs: 1000,
      groupId,
    });

    const signalBroker = Cadenza.signalBroker as any;

    expect(signalBroker.debouncedEmitters.size).toBeGreaterThan(0);
    expect(signalBroker.scheduledBuckets.size).toBeGreaterThan(0);
    expect(signalBroker.throttleQueues.size).toBeGreaterThan(0);
    expect(Cadenza.inquiryBroker.inquiryObservers.size).toBeGreaterThan(0);

    Cadenza.reset();

    expect(signalBroker.debouncedEmitters.size).toBe(0);
    expect(signalBroker.scheduledBuckets.size).toBe(0);
    expect(signalBroker.throttleQueues.size).toBe(0);
    expect(signalBroker.signalObservers.size).toBe(0);
    expect(signalBroker.emittedSignalsRegistry.size).toBe(0);
    expect(Cadenza.inquiryBroker.inquiryObservers.size).toBe(0);
    expect(Cadenza.inquiryBroker.intents.size).toBe(0);
  });
});
