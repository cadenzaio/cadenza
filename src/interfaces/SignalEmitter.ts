import Cadenza from "../Cadenza";
import { AnyObject } from "../types/global";

/**
 * Abstract class representing a signal emitter.
 * Allows emitting events or signals, with the option to suppress emissions if desired.
 */
export default abstract class SignalEmitter {
  silent: boolean;

  /**
   * Constructor for signal emitters.
   * @param silent If true, suppresses all emissions (e.g., for meta-runners to avoid loops; affects all emits).
   */
  constructor(silent: boolean = false) {
    this.silent = silent;
  }

  /**
   * Emits a signal via the broker.
   * @param signal The signal name.
   * @param data Optional payload (defaults to empty object).
   */
  emit(signal: string, data: AnyObject = {}): void {
    Cadenza.broker.emit(signal, data);
  }

  /**
   * Emits a signal via the broker if not silent.
   * @param signal The signal name.
   * @param data Optional payload (defaults to empty object).
   */
  emitMetrics(signal: string, data: AnyObject = {}): void {
    if (this.silent) {
      return;
    }
    Cadenza.broker.emit(signal, data);
  }
}
