import GraphRunner from "./GraphRunner";
import { AnyObject } from "../types/global";
import Task from "../graph/definition/Task";
import GraphRoutine from "../graph/definition/GraphRoutine";
import Cadenza from "../Cadenza";

export default class SignalBroker {
  private static instance_: SignalBroker;

  /**
   * Singleton instance for signal management.
   * @returns The broker instance.
   */
  static get instance(): SignalBroker {
    if (!this.instance_) {
      this.instance_ = new SignalBroker();
    }
    return this.instance_;
  }

  protected runner: GraphRunner | undefined;
  protected metaRunner: GraphRunner | undefined;

  public getSignalsTask: Task | undefined;

  protected signalObservers: Map<
    string,
    {
      fn: (
        runner: GraphRunner,
        tasks: (Task | GraphRoutine)[],
        context: AnyObject,
      ) => void;
      tasks: Set<Task | GraphRoutine>;
    }
  > = new Map();

  protected emitStacks: Map<string, Map<string, AnyObject>> = new Map(); // execId -> emitted signals

  protected constructor() {
    this.addSignal("meta.signal.added");
  }

  /**
   * Initializes with runners.
   * @param runner Standard runner for user signals.
   * @param metaRunner Meta runner for 'meta.' signals (suppresses further meta-emits).
   */
  bootstrap(runner: GraphRunner, metaRunner: GraphRunner): void {
    this.runner = runner;
    this.metaRunner = metaRunner;
  }

  init() {
    Cadenza.createMetaTask(
      "Execute and clear queued signals",
      () => {
        for (const [id, signals] of this.emitStacks.entries()) {
          signals.forEach((context, signal) => {
            this.execute(signal, context);
            signals.delete(signal);
          });
          this.emitStacks.delete(id);
        }
        return true;
      },
      "Executes queued signals and clears the stack",
    ).doOn("meta.clear_signal_queue_requested"); // TODO

    this.getSignalsTask = Cadenza.createMetaTask("Get signals", (ctx) => {
      return {
        __signals: Array.from(this.signalObservers.keys()),
        ...ctx,
      };
    });
  }

  /**
   * Observes a signal with a routine/task.
   * @param signal The signal (e.g., 'domain.action', 'domain.*' for wildcards).
   * @param routineOrTask The observer.
   * @edge Duplicates ignored; supports wildcards for broad listening.
   */
  observe(signal: string, routineOrTask: Task | GraphRoutine): void {
    this.addSignal(signal);
    this.signalObservers.get(signal)!.tasks.add(routineOrTask);
  }

  /**
   * Unsubscribes a routine/task from a signal.
   * @param signal The signal.
   * @param routineOrTask The observer.
   * @edge Removes all instances if duplicate; deletes if empty.
   */
  unsubscribe(signal: string, routineOrTask: Task | GraphRoutine): void {
    const obs = this.signalObservers.get(signal);
    if (obs) {
      obs.tasks.delete(routineOrTask);
      if (obs.tasks.size === 0) {
        this.signalObservers.delete(signal);
      }
    }
  }

  /**
   * Emits a signal and bubbles to matching wildcards/parents (e.g., 'a.b.action' triggers 'a.b.action', 'a.b.*', 'a.*').
   * @param signal The signal name.
   * @param context The payload.
   * @edge Fire-and-forget; guards against loops per execId (from context.__graphExecId).
   * @edge For distribution, SignalTask can prefix and proxy remote.
   * @throws Error on detected loop.
   */
  emit(signal: string, context: AnyObject = {}): void {
    const execId = context.__graphExecId || "global"; // Assume from metadata
    if (!this.emitStacks.has(execId)) this.emitStacks.set(execId, new Map());

    const stack = this.emitStacks.get(execId)!;
    stack.set(signal, context);

    let executed = false;
    try {
      executed = this.execute(signal, context);
    } finally {
      if (executed) stack.delete(signal); // Clean up
      // Optional: Clear stack post-run via meta-signal
    }
  }

  execute(signal: string, context: AnyObject): boolean {
    let executed;
    executed = this.executeListener(signal, context); // Exact signal

    const parts = signal
      .slice(0, Math.max(signal.lastIndexOf(":"), signal.lastIndexOf(".")))
      .split(".");
    for (let i = parts.length; i > 0; i--) {
      const parent = parts.slice(0, i).join(".");
      executed = executed || this.executeListener(parent + ".*", context); // Wildcard
    }

    return executed;
  }

  private executeListener(signal: string, context: AnyObject): boolean {
    const obs = this.signalObservers.get(signal);
    const runner = this.getRunner(signal);
    if (obs && runner) {
      obs.fn(runner, Array.from(obs.tasks), context);
      return true;
    }
    return false;
  }

  private addSignal(signal: string): void {
    if (!this.signalObservers.has(signal)) {
      this.signalObservers.set(signal, {
        fn: (
          runner: GraphRunner,
          tasks: (Task | GraphRoutine)[],
          context: AnyObject,
        ) => runner.run(tasks, context),
        tasks: new Set(),
      });

      this.emit("meta.signal.added", { __signal: signal });
    }
  }

  /**
   * Lists all observed signals.
   * @returns Array of signals.
   */
  listObservedSignals(): string[] {
    return Array.from(this.signalObservers.keys());
  }

  private getRunner(signal: string): GraphRunner | undefined {
    return signal.startsWith("meta") ? this.metaRunner : this.runner;
  }

  reset() {
    this.emitStacks.clear();
    this.signalObservers.clear();
  }
}
