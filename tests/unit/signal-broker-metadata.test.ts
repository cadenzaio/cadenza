import { beforeEach, describe, expect, it } from "vitest";
import Cadenza from "../../src/Cadenza";

describe("SignalBroker metadata", () => {
  beforeEach(() => {
    try {
      Cadenza.reset();
    } catch {
      // Ignore first-run reset errors before bootstrap.
    }

    Cadenza.setMode("debug");
    Cadenza.signalBroker.updateFlushStrategy("default", {
      intervalMs: 50,
      maxBatchSize: 80,
    });
  });

  it("marks sub-meta emission payloads when the signal broker creates a new trace", async () => {
    let payload: Record<string, any> | undefined;

    Cadenza.createMetaTask("Capture emitting signal metadata", (ctx) => {
      if (ctx?.foo === "bar") {
        payload = ctx;
      }
      return true;
    }).doOn("sub_meta.signal_broker.emitting_signal");

    Cadenza.emit("runner.tick", { foo: "bar" });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(payload?.__traceCreatedBySignalBroker).toBe(true);
    expect(payload?.foo).toBe("bar");
    expect(typeof payload?.__signalEmission?.executionTraceId).toBe("string");
    expect(payload?.__signalEmission?.__traceCreatedBySignalBroker).toBe(true);
  });

  it("does not mark the payload when an execution trace already exists", async () => {
    let payload: Record<string, any> | undefined;

    Cadenza.createMetaTask("Capture existing trace emission metadata", (ctx) => {
      payload = ctx;
      return true;
    }).doOn("sub_meta.signal_broker.emitting_signal");

    Cadenza.emit("runner.tick", {
      __executionTraceId: "existing-trace-id",
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(payload?.__traceCreatedBySignalBroker).toBeUndefined();
    expect(payload?.__signalEmission?.executionTraceId).toBe("existing-trace-id");
    expect(payload?.__signalEmission?.__traceCreatedBySignalBroker).toBe(false);
  });

  it("preserves upstream signal emission identity for received transported signals", async () => {
    let persistenceAttempts = 0;
    let scheduledPayload: Record<string, any> | undefined;

    Cadenza.createMetaTask("Count transported signal persistence attempts", (ctx) => {
      if (ctx?.__signalEmission?.signalName === "orders.created") {
        persistenceAttempts += 1;
      }
      return true;
    }).doOn("sub_meta.signal_broker.emitting_signal");

    Cadenza.createMetaTask("Capture transported scheduled payload", (ctx) => {
      if (ctx?.data?.taskName === "Consume orders created") {
        scheduledPayload = ctx;
      }
      return true;
    }).doOn("meta.node.scheduled");

    Cadenza.createTask("Consume orders created", () => true).doOn(
      "orders.created",
    );

    persistenceAttempts = 0;

    Cadenza.emit("orders.created", {
      orderId: "order-1",
      __receivedSignalTransmission: true,
      __signalEmissionId: "signal-transport-1",
      __signalEmission: {
        uuid: "signal-transport-1",
        fullSignalName: "orders.created",
        signalName: "orders.created",
        signalTag: null,
        taskName: "Publish order created",
        taskVersion: 1,
        taskExecutionId: "source-task-exec-1",
        routineExecutionId: "source-routine-exec-1",
        executionTraceId: "trace-transport-1",
        emittedAt: "2026-03-25T00:00:00.000Z",
        consumed: false,
        consumedBy: null,
        isMeta: false,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(persistenceAttempts).toBe(0);
    expect(scheduledPayload?.data?.signalEmissionId).toBe("signal-transport-1");
    expect(scheduledPayload?.data?.executionTraceId).toBe("trace-transport-1");
  });

  it("marks fresh local routines with local-only execution ordering hints", async () => {
    let payload: Record<string, any> | undefined;

    Cadenza.createMetaTask("Capture added tasks metadata", (ctx) => {
      payload = ctx;
      return true;
    }).doOn("meta.runner.added_tasks");

    Cadenza.run(
      Cadenza.createTask("Persist telemetry sample", () => true),
      { deviceId: "device-1" },
    );

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(payload?.data?.name).toBe("Persist telemetry sample");
    expect(payload?.data?.metaContext?.__traceCreatedByRunner).toBe(true);
    expect(payload?.data?.metaContext?.__routineCreatedByRunner).toBe(true);
    expect(payload?.data?.metaContext?.__routineName).toBe(
      "Persist telemetry sample",
    );
    expect(payload?.data?.metaContext?.__routineCreatedAt).toEqual(
      expect.any(String),
    );
  });

  it("includes executionTraceId on mapped task metadata", async () => {
    let payload: Record<string, any> | undefined;

    Cadenza.createMetaTask("Capture mapped task metadata", (ctx) => {
      if (ctx?.data?.previousTaskExecutionId) {
        payload = ctx;
      }
      return true;
    }).doOn("meta.node.mapped");

    const firstTask = Cadenza.createTask("First mapped task", () => true);
    const secondTask = Cadenza.createTask("Second mapped task", () => true);
    firstTask.then(secondTask);

    Cadenza.run(firstTask, { deviceId: "device-1" });

    await new Promise((resolve) => setTimeout(resolve, 1250));

    expect(payload?.data?.taskExecutionId).toEqual(expect.any(String));
    expect(payload?.data?.previousTaskExecutionId).toEqual(expect.any(String));
    expect(payload?.data?.executionTraceId).toEqual(expect.any(String));
  });

  it("stores delivery metadata for attached signals", () => {
    Cadenza.createTask("Publish orders created", () => true).attachSignal({
      name: "orders.created",
      deliveryMode: "broadcast",
      broadcastFilter: {
        serviceNames: ["BillingService"],
        origins: ["http://billing.internal"],
      },
    });

    expect(Cadenza.signalBroker.getSignalMetadata("orders.created")).toEqual({
      deliveryMode: "broadcast",
      broadcastFilter: {
        serviceNames: ["BillingService"],
        origins: ["http://billing.internal"],
      },
    });
  });

  it("normalizes tagged signal metadata onto the base signal", () => {
    Cadenza.createTask("Publish tagged orders signal", () => true).attachSignal({
      name: "orders.created:vip",
      deliveryMode: "broadcast",
      broadcastFilter: {
        serviceInstanceIds: ["billing-1"],
      },
    });

    expect(Cadenza.signalBroker.getSignalMetadata("orders.created")).toEqual({
      deliveryMode: "broadcast",
      broadcastFilter: {
        serviceInstanceIds: ["billing-1"],
      },
    });
    expect(Cadenza.signalBroker.getSignalMetadata("orders.created:vip")).toEqual({
      deliveryMode: "broadcast",
      broadcastFilter: {
        serviceInstanceIds: ["billing-1"],
      },
    });
  });
});
