import Cadenza from "../Cadenza";
import { AnyObject } from "../types/global";

export default abstract class SignalEmitter {
  protected silent: boolean;

  /**
   * Constructor for signal emitters.
   * @param silent If true, suppresses all emissions (e.g., for meta-runners to avoid loops; affects all emits).
   */
  constructor(silent: boolean = false) {
    this.silent = silent;
  }

  /**
   * Emits a signal via the broker if not silent.
   * @param signal The signal name.
   * @param data Optional payload (defaults to empty object).
   * @edge No emission if silent; for metrics in silent mode, consider override or separate method.
   */
  protected emit(signal: string, data: AnyObject = {}): void {
    if (this.silent) {
      return;
    }
    Cadenza.broker.emit(signal, data);
  }

  /**
   * Emits a signal via the broker even if silent.
   * @param signal The signal name.
   * @param data Optional payload (defaults to empty object).
   */
  protected emitMetric(signal: string, data: AnyObject = {}): void {
    Cadenza.broker.emit(signal, data); // Ignore silent
  }
}
