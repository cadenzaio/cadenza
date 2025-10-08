import GraphRunner from "./GraphRunner";
import { AnyObject } from "../types/global";
import Task from "../graph/definition/Task";
import GraphRoutine from "../graph/definition/GraphRoutine";
import Cadenza from "../Cadenza";
import { formatTimestamp } from "../utils/tools";

export default class SignalBroker {
  static instance_: SignalBroker;

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

  debug: boolean = false;
  verbose: boolean = false;

  setDebug(value: boolean) {
    this.debug = value;
  }

  setVerbose(value: boolean) {
    this.verbose = value;
  }

  validateSignalName(signalName: string) {
    if (signalName.length > 100) {
      throw new Error(
        `Signal name must be less than 100 characters: ${signalName}`,
      );
    }

    if (signalName.includes(" ")) {
      throw new Error(`Signal name must not contain spaces: ${signalName}"`);
    }

    if (signalName.includes("\\")) {
      throw new Error(
        `Signal name must not contain backslashes: ${signalName}`,
      );
    }

    if (/[A-Z]/.test(signalName.split(":")[0].split(".").slice(1).join("."))) {
      throw new Error(
        `Signal name must not contain uppercase letters in the middle of the signal name. It is only allowed in the first part of the signal name: ${signalName}`,
      );
    }
  }

  runner: GraphRunner | undefined;
  metaRunner: GraphRunner | undefined;

  public clearSignalsTask: Task | undefined;
  public getSignalsTask: Task | undefined;
  public registerSignalTask: Task | undefined;

  // TODO: Signals should be a class with a the observers, registered flag and other data.
  signalObservers: Map<
    string,
    {
      fn: (
        runner: GraphRunner,
        tasks: (Task | GraphRoutine)[],
        context: AnyObject,
      ) => void;
      tasks: Set<Task | GraphRoutine>;
      registered: boolean;
    }
  > = new Map();

  emitStacks: Map<string, Map<string, AnyObject>> = new Map(); // execId -> emitted signals

  constructor() {
    this.addSignal("meta.signal_broker.added");
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
    this.clearSignalsTask = Cadenza.createDebounceMetaTask(
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
    )
      .doOn("meta.process_signal_queue_requested")
      .emits("meta.signal_broker.queue_empty");

    this.getSignalsTask = Cadenza.createMetaTask("Get signals", (ctx) => {
      const uniqueSignals = Array.from(this.signalObservers.keys()).filter(
        (s) => !s.includes(":"),
      );

      const processedSignals = uniqueSignals.map((signal) => ({
        signal,
        data: {
          registered: this.signalObservers.get(signal)?.registered ?? false,
        },
      }));

      return {
        __signals: processedSignals,
        ...ctx,
      };
    });

    this.registerSignalTask = Cadenza.createMetaTask(
      "Register signal",
      (ctx) => {
        const { __signalName } = ctx;
        this.signalObservers.get(__signalName)!.registered = true;
      },
    ).doOn("meta.signal.registered");
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
   */
  emit(signal: string, context: AnyObject = {}): void {
    const execId = context.__routineExecId || "global"; // Assume from metadata
    delete context.__routineExecId;

    if (!this.emitStacks.has(execId)) this.emitStacks.set(execId, new Map());
    const stack = this.emitStacks.get(execId)!;
    stack.set(signal, context);

    this.addSignal(signal);

    let executed = false;
    try {
      executed = this.execute(signal, context);
    } finally {
      if (executed) stack.delete(signal);
      if (stack.size === 0) this.emitStacks.delete(execId);
    }
  }

  execute(signal: string, context: AnyObject): boolean {
    const isMeta = signal.includes("meta.");
    const isSubMeta = signal.includes("sub_meta.") || context.__isSubMeta;
    const isMetric = context.__signalEmission?.isMetric;

    if (!isSubMeta && (!isMeta || this.debug)) {
      const emittedAt = Date.now();
      context.__signalEmission = {
        ...(context.__signalEmission ?? {}),
        signalName: signal,
        emittedAt: formatTimestamp(emittedAt),
        consumed: false,
        consumedBy: null,
        isMeta,
      };
    } else if (isSubMeta) {
      context.__isSubMeta = true;
      delete context.__signalEmission;
    } else {
      delete context.__signalEmission;
    }

    if (this.debug && ((!isMetric && !isSubMeta) || this.verbose)) {
      console.log(
        `EMITTING ${signal} to listeners ${this.signalObservers.get(signal)?.tasks.size ?? 0} with context ${this.verbose ? JSON.stringify(context) : JSON.stringify(context).slice(0, 100)}`,
      );
    }

    let executed;
    executed = this.executeListener(signal, context); // Exact signal

    if (!isSubMeta) {
      const parts = signal
        .slice(0, Math.max(signal.lastIndexOf(":"), signal.lastIndexOf(".")))
        .split(".");
      for (let i = parts.length; i > -1; i--) {
        const parent = parts.slice(0, i).join(".");
        executed = this.executeListener(parent + ".*", context) || executed; // Wildcard
      }
    }

    return executed;
  }

  executeListener(signal: string, context: AnyObject): boolean {
    const obs = this.signalObservers.get(signal);
    const isMeta = signal.startsWith("meta");
    const runner = isMeta ? this.metaRunner : this.runner;
    if (obs && obs.tasks.size && runner) {
      obs.fn(runner, Array.from(obs.tasks), context);
      return true;
    }
    return false;
  }

  addSignal(signal: string): void {
    let _signal = signal;
    if (!this.signalObservers.has(_signal)) {
      this.validateSignalName(_signal);
      this.signalObservers.set(_signal, {
        fn: (
          runner: GraphRunner,
          tasks: (Task | GraphRoutine)[],
          context: AnyObject,
        ) => runner.run(tasks, context),
        tasks: new Set(),
        registered: false,
      });

      const sections = _signal.split(":");
      if (sections.length === 2) {
        _signal = sections[0];

        if (!this.signalObservers.has(sections[0])) {
          this.signalObservers.set(_signal, {
            fn: (
              runner: GraphRunner,
              tasks: (Task | GraphRoutine)[],
              context: AnyObject,
            ) => runner.run(tasks, context),
            tasks: new Set(),
            registered: false,
          });
        } else {
          return;
        }
      }

      this.emit("meta.signal_broker.added", { __signalName: _signal });
    }
  }

  // TODO schedule signals

  /**
   * Lists all observed signals.
   * @returns Array of signals.
   */
  listObservedSignals(): string[] {
    return Array.from(this.signalObservers.keys());
  }

  reset() {
    this.emitStacks.clear();
    this.signalObservers.clear();
  }
}
