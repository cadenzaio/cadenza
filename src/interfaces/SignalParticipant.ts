import SignalEmitter from "./SignalEmitter";
import GraphContext from "../graph/context/GraphContext";
import Cadenza from "../Cadenza";

export default class SignalParticipant extends SignalEmitter {
  emitsSignals: Set<string> = new Set();
  signalsToEmitAfter: Set<string> = new Set();
  signalsToEmitOnFail: Set<string> = new Set();
  observedSignals: Set<string> = new Set();

  /**
   * Subscribes to signals (chainable).
   * @param signals The signal names.
   * @returns This for chaining.
   * @edge Duplicates ignored; assumes broker.observe binds this as handler.
   */
  doOn(...signals: string[]): this {
    signals.forEach((signal) => {
      if (this.observedSignals.has(signal)) return;
      Cadenza.broker.observe(signal, this as any);
      this.observedSignals.add(signal);
    });
    return this;
  }

  /**
   * Sets signals to emit post-execution (chainable).
   * @param signals The signal names.
   * @returns This for chaining.
   */
  emitsAfter(...signals: string[]): this {
    signals.forEach((signal) => {
      this.signalsToEmitAfter.add(signal);
      this.emitsSignals.add(signal);
    });
    return this;
  }

  emitsOnFail(...signals: string[]): this {
    signals.forEach((signal) => {
      this.signalsToEmitOnFail.add(signal);
      this.emitsSignals.add(signal);
    });
    return this;
  }

  /**
   * Unsubscribes from all observed signals.
   * @returns This for chaining.
   */
  unsubscribeAll(): this {
    this.observedSignals.forEach((signal) =>
      Cadenza.broker.unsubscribe(signal, this as any),
    );
    this.observedSignals.clear();
    return this;
  }

  /**
   * Unsubscribes from specific signals.
   * @param signals The signals.
   * @returns This for chaining.
   * @edge No-op if not subscribed.
   */
  unsubscribe(...signals: string[]): this {
    signals.forEach((signal) => {
      if (this.observedSignals.has(signal)) {
        Cadenza.broker.unsubscribe(signal, this as any);
        this.observedSignals.delete(signal);
      }
    });
    return this;
  }

  /**
   * Detaches specific emitted signals.
   * @param signals The signals.
   * @returns This for chaining.
   */
  detachSignals(...signals: string[]): this {
    signals.forEach((signal) => this.signalsToEmitAfter.delete(signal));
    return this;
  }

  /**
   * Detaches all emitted signals.
   * @returns This for chaining.
   */
  detachAllSignals(): this {
    this.signalsToEmitAfter.clear();
    return this;
  }

  mapSignals(callback: (signal: string) => void) {
    return Array.from(this.signalsToEmitAfter).map(callback);
  }

  mapOnFailSignals(callback: (signal: string) => void) {
    return Array.from(this.signalsToEmitOnFail).map(callback);
  }

  /**
   * Emits attached signals.
   * @param context The context for emission.
   * @edge If isMeta (from Task), suppresses further "meta.*" to prevent loops.
   */
  emitSignals(context: GraphContext): void {
    this.signalsToEmitAfter.forEach((signal) => {
      this.emit(signal, context.getFullContext());
    });
  }

  /**
   * Emits attached fail signals.
   * @param context The context for emission.
   * @edge If isMeta (from Task), suppresses further "meta.*" to prevent loops.
   */
  emitOnFailSignals(context: GraphContext): void {
    this.signalsToEmitOnFail.forEach((signal) => {
      this.emit(signal, context.getFullContext());
    });
  }

  /**
   * Destroys the participant (unsub/detach).
   */
  destroy(): void {
    this.unsubscribeAll();
    this.detachAllSignals();
  }
}
