import GraphRunner from "./GraphRunner";
import { AnyObject, ThrottleHandle } from "../types/global";
import Task from "../graph/definition/Task";
import GraphRoutine from "../graph/definition/GraphRoutine";
import Cadenza from "../Cadenza";
import { formatTimestamp } from "../utils/tools";
import { v4 as uuid } from "uuid";

/**
 * This class manages signals and observers, enabling communication across different parts of an application.
 * It follows a singleton design pattern, allowing for centralized signal management.
 */
export default class SignalBroker {
  static instance_: SignalBroker;

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

  /**
   * Validates the provided signal name string to ensure it adheres to specific formatting rules.
   * Throws an error if any of the validation checks fail.
   *
   * @param {string} signalName - The signal name to be validated.
   * @return {void} - Returns nothing if the signal name is valid.
   * @throws {Error} - Throws an error if the signal name is longer than 100 characters, contains spaces,
   *                   contains backslashes, or contains uppercase letters in restricted parts of the name.
   */
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

  /**
   * Initializes and sets up the various tasks for managing and processing signals.
   *
   * @return {void} This method does not return a value.
   */
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
   * Schedules a signal to be emitted after a specified delay or at an exact date and time.
   *
   * @param {string} signal - The name of the signal to be emitted.
   * @param {AnyObject} context - The context to be passed along with the signal.
   * @param {number} [timeoutMs=60000] - The delay in milliseconds before the signal is emitted. Defaults to 60,000 ms.
   * @param {Date} [exactDateTime] - An exact date and time at which to emit the signal. If provided, this overrides the `timeoutMs`.
   * @return {AbortController} An AbortController instance that can be used to cancel the scheduled signal emission.
   */
  schedule(
    signal: string,
    context: AnyObject,
    timeoutMs: number = 60_000,
    exactDateTime?: Date,
  ): AbortController {
    // 1. Compute the final delay
    let delay = timeoutMs;
    if (exactDateTime != null) {
      delay = exactDateTime.getTime() - Date.now();
    }
    delay = Math.max(0, timeoutMs);

    // 2. Create an AbortController so the caller can cancel
    const controller = new AbortController();
    const { signal: signalController } = controller;

    const tick = () => this.emit(signal, context);

    const timerId = setTimeout(() => {
      if (!signalController.aborted) tick();
    }, delay);

    // 3. Cleanup on abort
    signalController.addEventListener("abort", () => clearTimeout(timerId));

    return controller; // caller can do `const ac = obj.schedule(...); ac.abort();`
  }

  /**
   * Emits `signal` repeatedly with a fixed interval.
   *
   * @param signal
   * @param context
   * @param intervalMs
   * @param leading  If true, emits immediately (unless a startDateTime is given and we are before it).
   * @param startDateTime  Optional absolute Date when the *first* emission after `leading` should occur.
   * @returns a handle with `clear()` to stop the loop.
   */
  throttle(
    signal: string,
    context: AnyObject,
    intervalMs: number = 60_000,
    leading = false,
    startDateTime?: Date,
  ): ThrottleHandle {
    if (intervalMs <= 0) {
      throw new Error("intervalMs must be a positive number");
    }

    const emit = () => this.emit(signal, context);

    if (leading) {
      const now = Date.now();
      const start = startDateTime?.getTime();

      // If we have a startDateTime and we are already past it → fire now
      if (!start || start <= now) {
        emit();
      }
    }

    let firstDelay = intervalMs;
    if (startDateTime) {
      // Find the *next* slot that is >= now
      let slot = startDateTime.getTime();
      const now = Date.now();

      while (slot < now) {
        slot += intervalMs;
      }
      firstDelay = slot - now;
    }

    let timer: NodeJS.Timeout | null = null;
    let stopped = false;

    const scheduleNext = () => {
      if (stopped) return;
      emit();
      timer = setTimeout(scheduleNext, intervalMs);
    };

    timer = setTimeout(scheduleNext, firstDelay);

    return {
      clear() {
        stopped = true;
        if (timer !== null) clearTimeout(timer);
      },
    };
  }

  /**
   * Emits a signal with the specified context, triggering any associated handlers for that signal.
   *
   * @param {string} signal - The name of the signal to emit.
   * @param {AnyObject} [context={}] - An optional context object containing additional information or metadata
   * associated with the signal. If the context includes a `__routineExecId`, it will be handled accordingly.
   * @return {void} This method does not return a value.
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

  /**
   * Executes a signal by emitting events, updating context, and invoking listeners.
   * Creates a new execution trace if necessary and updates the context with relevant metadata.
   * Handles specific, hierarchy-based, and wildcard signals.
   *
   * @param {string} signal - The signal name to be executed, potentially including namespaces or tags (e.g., "meta.*" or "signal:type").
   * @param {AnyObject} context - An object containing relevant metadata and execution details used for handling the signal.
   * @return {boolean} Returns true if any listeners were successfully executed, otherwise false.
   */
  execute(signal: string, context: AnyObject): boolean {
    const isMeta = signal.includes("meta.");
    const isSubMeta = signal.includes("sub_meta.") || context.__isSubMeta;
    const isMetric = context.__signalEmission?.isMetric;

    const executionTraceId =
      context.__signalEmission?.executionTraceId ??
      context.__metadata?.__executionTraceId ??
      context.__executionTraceId ??
      uuid();

    if (!isSubMeta && (!isMeta || this.debug)) {
      const isNewTrace =
        !context.__signalEmission?.executionTraceId &&
        !context.__metadata?.__executionTraceId &&
        !context.__executionTraceId;

      if (isNewTrace) {
        this.emit("sub_meta.signal_broker.new_trace", {
          data: {
            uuid: executionTraceId,
            issuer_type: "service", // TODO: Add issuer type
            issuer_id:
              context.__metadata?.__issuerId ?? context.__issuerId ?? null,
            issued_at: formatTimestamp(Date.now()),
            intent: context.__metadata?.__intent ?? context.__intent ?? null,
            context: {
              id: uuid(),
              context: context,
            },
            is_meta: isMeta,
          },
          metadata: {
            __executionTraceId: executionTraceId,
          },
        });
      }

      context.__metadata = {
        ...context.__metadata,
        __executionTraceId: executionTraceId,
      };

      const emittedAt = Date.now();

      const signalParts = signal.split(":");
      const signalName = signalParts[0];
      const signalTag = signalParts.length > 1 ? signalParts[1] : null;
      context.__signalEmission = {
        ...(context.__signalEmission ?? {}),
        uuid: uuid(),
        executionTraceId,
        signalName,
        signalTag,
        emittedAt: formatTimestamp(emittedAt),
        consumed: false,
        consumedBy: null,
        isMeta,
      };

      this.emit("sub_meta.signal_broker.emitting_signal", context);
    } else if (isSubMeta) {
      context.__isSubMeta = true;
    }

    context.__metadata = {
      ...context.__metadata,
      __executionTraceId: executionTraceId,
    };

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

  /**
   * Executes the tasks associated with a given signal and context.
   * It processes both normal and meta tasks depending on the signal type
   * and the availability of the appropriate runner.
   *
   * @param {string} signal - The signal identifier that determines which tasks to execute.
   * @param {AnyObject} context - The context object passed to the task execution function.
   * @return {boolean} - Returns true if tasks were executed; otherwise, false.
   */
  executeListener(signal: string, context: AnyObject): boolean {
    const obs = this.signalObservers.get(signal);
    if (!obs || obs.tasks.size === 0) {
      return false;
    }

    const isMeta = signal.startsWith("meta");
    if (!isMeta) {
      const tasks: Task[] = [];
      const metaTasks: Task[] = [];

      obs.tasks.forEach(
        (
          task, // @ts-ignore
        ) => (task.isMeta ? metaTasks.push(task) : tasks.push(task)),
      );

      if (tasks.length && this.runner) {
        obs.fn(this.runner, tasks, context);
      }

      if (metaTasks.length && this.metaRunner) {
        obs.fn(this.metaRunner, metaTasks, context);
      }

      return true;
    } else if (this.metaRunner) {
      obs.fn(this.metaRunner, Array.from(obs.tasks), context);
      return true;
    }

    return false;
  }

  /**
   * Adds a signal to the signalObservers for tracking and execution.
   * Performs validation on the signal name and emits a meta signal event when added.
   * If the signal contains a namespace (denoted by a colon ":"), its base signal is
   * also added if it doesn't already exist.
   *
   * @param {string} signal - The name of the signal to be added.
   * @return {void} This method does not return any value.
   */
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
