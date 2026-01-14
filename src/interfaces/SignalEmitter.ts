import Cadenza from "../Cadenza";
import { AnyObject } from "../types/global";
import { EmitOptions } from "../engine/SignalBroker";

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
   * @param options
   */
  emit(signal: string, data: AnyObject = {}, options: EmitOptions = {}): void {
    Cadenza.signalBroker.emit(signal, data, options);
  }

  /**
   * Emits a signal via the broker if not silent.
   * @param signal The signal name.
   * @param data Optional payload (defaults to empty object).
   * @param options
   */
  emitMetrics(
    signal: string,
    data: AnyObject = {},
    options: EmitOptions = {},
  ): void {
    if (this.silent) {
      return;
    }
    Cadenza.signalBroker.emit(signal, data, options);
  }
}
