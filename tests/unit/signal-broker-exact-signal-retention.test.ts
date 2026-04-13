import { beforeEach, describe, expect, it } from "vitest";
import Cadenza from "../../src/Cadenza";

describe("SignalBroker exact signal retention", () => {
  beforeEach(() => {
    try {
      Cadenza.reset();
    } catch {
      // Ignore first-run reset errors before bootstrap.
    }

    Cadenza.bootstrap();
  });

  it("does not retain emitted exact signals with no observers", async () => {
    Cadenza.emit("meta.fetch.handshake_failed:fetch-1", { ok: false });

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(
      Cadenza.signalBroker.signalObservers.has(
        "meta.fetch.handshake_failed:fetch-1",
      ),
    ).toBe(false);
    expect(Cadenza.signalBroker.signalObservers.has("meta.fetch.handshake_failed")).toBe(
      false,
    );
  });

  it("still delivers exact signals when a task explicitly observes them", async () => {
    let observed = false;

    Cadenza.createMetaTask("Observe exact handshake failure", () => {
      observed = true;
      return true;
    }).doOn("meta.fetch.handshake_failed:fetch-2");

    Cadenza.emit("meta.fetch.handshake_failed:fetch-2", { ok: false });

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(observed).toBe(true);
    expect(
      Cadenza.signalBroker.signalObservers.has(
        "meta.fetch.handshake_failed:fetch-2",
      ),
    ).toBe(true);
  });

  it("still delivers wildcard listeners for exact emitted signals", async () => {
    let observed = false;

    Cadenza.createMetaTask("Observe wildcard handshake failures", () => {
      observed = true;
      return true;
    }).doOn("meta.fetch.*");

    Cadenza.emit("meta.fetch.handshake_failed:fetch-3", { ok: false });

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(observed).toBe(true);
  });

  it("normalizes exact emitted signal registrations to the base signal", () => {
    Cadenza.signalBroker.registerEmittedSignal(
      "meta.fetch.handshake_failed:fetch-4",
      {
        deliveryMode: "broadcast",
      },
    );

    expect(Cadenza.signalBroker.emittedSignalsRegistry.has("meta.fetch.handshake_failed")).toBe(
      true,
    );
    expect(
      Cadenza.signalBroker.emittedSignalsRegistry.has(
        "meta.fetch.handshake_failed:fetch-4",
      ),
    ).toBe(false);
    expect(
      Cadenza.signalBroker.getSignalMetadata("meta.fetch.handshake_failed:fetch-4"),
    ).toEqual({
      deliveryMode: "broadcast",
      broadcastFilter: null,
    });
  });
});
