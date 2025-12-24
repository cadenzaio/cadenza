import GraphRunner from "./GraphRunner";
import { AnyObject, ThrottleHandle } from "../types/global";
import Task from "../graph/definition/Task";
import GraphRoutine from "../graph/definition/GraphRoutine";
import Cadenza from "../Cadenza";
import { formatTimestamp } from "../utils/tools";
import { v4 as uuid } from "uuid";
import debounce from "lodash-es/debounce";
import { merge } from "lodash-es";
import { sleep } from "../utils/promise";

export interface EmitOptions {
  squash?: boolean;
  squashId?: string | null;
  groupId?: string | null;
  mergeFunction?:
    | ((oldContext: AnyObject, newContext: AnyObject) => AnyObject)
    | null;
  debounce?: boolean;
  throttle?: boolean;
  delayMs?: number;
  schedule?: boolean;
  exactDateTime?: Date | null;
  throttleBatch?: number;
}

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

  debouncedEmitters: Map<string, any> = new Map();
  squashedEmitters: Map<string, any> = new Map();
  squashedContexts: Map<string, any> = new Map();
  throttleEmitters: Map<string, any> = new Map();
  throttleQueues: Map<string, any> = new Map();

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

  emittedSignalsRegistry: Set<string> = new Set();

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
    this.getSignalsTask = Cadenza.createMetaTask("Get signals", (ctx) => {
      const uniqueSignals = Array.from(
        new Set([
          ...this.signalObservers.keys(),
          ...this.emittedSignalsRegistry,
        ]),
      ).filter((s) => !s.includes(":"));

      const processedSignals = uniqueSignals.map((signal) => ({
        signal,
        data: {
          registered: this.signalObservers.get(signal)?.registered ?? false,
        },
      }));

      return {
        signals: processedSignals,
        ...ctx,
      };
    });

    this.registerSignalTask = Cadenza.createMetaTask(
      "Register signal",
      (ctx) => {
        const { signalName } = ctx;
        if (!this.signalObservers.has(signalName)) {
          this.addSignal(signalName);
        }

        this.signalObservers.get(signalName)!.registered = true;
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

  registerEmittedSignal(signal: string): void {
    this.emittedSignalsRegistry.add(signal);
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
   * @param options
   * @return {AbortController} An AbortController instance that can be used to cancel the scheduled signal emission.
   */
  schedule(
    signal: string,
    context: AnyObject,
    options: EmitOptions = { delayMs: 60_000 },
  ): AbortController {
    // 1. Compute the final delay
    let delay = options.delayMs;
    if (options.exactDateTime != null) {
      delay = options.exactDateTime.getTime() - Date.now();
    }
    delay = Math.max(0, delay ?? 0);

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
  interval(
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

  debounce(signal: string, context: any, options = { delayMs: 500 }) {
    let debouncedEmitter = this.debouncedEmitters.get(signal);
    if (!debouncedEmitter) {
      this.debouncedEmitters.set(
        signal,
        debounce((ctx: any) => {
          this.emit(signal, ctx);
        }, options.delayMs ?? 300),
      );

      debouncedEmitter = this.debouncedEmitters.get(signal);
    }

    debouncedEmitter(context);
  }

  throttle(
    signal: string,
    context: any,
    options: EmitOptions = { delayMs: 1000 },
  ) {
    let { groupId, delayMs = 300 } = options;
    if (!groupId) {
      groupId = signal;
    }

    if (!this.throttleQueues.has(groupId)) {
      this.throttleQueues.set(groupId, []);
    }

    const queue = this.throttleQueues.get(groupId);
    queue.push([signal, context]);

    if (!this.throttleEmitters.has(groupId)) {
      this.throttleEmitters.set(groupId, async () => {
        while (queue.length > 0) {
          let batchSize = options.throttleBatch ?? 1;
          if (batchSize > queue.length) {
            batchSize = queue.length;
          }
          for (let i = 0; i < batchSize; i++) {
            const [nextSignal, nextContext] = queue.shift();
            this.emit(nextSignal, nextContext); // Emit the signal
          }
          await sleep(delayMs); // Wait for the delay
        }
        // Remove the groupId from throttleEmitters when the queue is done
        this.throttleEmitters.delete(groupId);
        this.throttleQueues.delete(groupId);
      });

      // Start processing the queue
      this.throttleEmitters.get(groupId)();
    }
  }

  /**
   * Aggregates and debounces multiple events with the same identifier to minimize redundant operations.
   *
   * @param {string} signal - The identifier for the event being emitted.
   * @param {AnyObject} context - The context data associated with the event.
   * @param {Object} [options] - Configuration options for handling the squashed event.
   * @param {boolean} [options.squash=true] - Whether the event should be squashed.
   * @param {string|null} [options.squashId=null] - A unique identifier for the squashed group of events. Defaults to the signal if null.
   * @param {function|null} [options.mergeFunction=null] - A custom merge function that combines old and new contexts. If null, a default merge is used.
   * @return {void} Does not return a value.
   */
  squash(
    signal: string,
    context: AnyObject,
    options: EmitOptions = { squash: true },
  ): void {
    let { squashId, delayMs = 300 } = options;
    if (!squashId) {
      squashId = signal;
    }

    if (!this.squashedEmitters.has(squashId)) {
      this.squashedEmitters.set(
        squashId,
        debounce(() => {
          options.squash = false;
          this.emit(signal, this.squashedContexts.get(squashId), options);
          this.squashedEmitters.delete(squashId);
          this.squashedContexts.delete(squashId);
        }, delayMs ?? 300),
      );
      this.squashedContexts.set(squashId, context);
    } else {
      this.squashedContexts.set(
        squashId,
        options.mergeFunction
          ? options.mergeFunction(this.squashedContexts.get(squashId), context)
          : merge(this.squashedContexts.get(squashId), context),
      );
    }

    this.squashedEmitters.get(squashId)();
  }

  /**
   * Emits a signal with the specified context, triggering any associated handlers for that signal.
   *
   * @param {string} signal - The name of the signal to emit.
   * @param {AnyObject} [context={}] - An optional context object containing additional information or metadata
   * associated with the signal. If the context includes a `__routineExecId`, it will be handled accordingly.
   * @param options
   * @return {void} This method does not return a value.
   */
  emit(
    signal: string,
    context: AnyObject = {},
    options: EmitOptions = {},
  ): void {
    delete context.__routineExecId;
    if (options.squash) {
      this.squash(signal, context, options);
      return;
    }

    if (options.debounce) {
      this.debounce(signal, context);
      return;
    }

    if (options.schedule) {
      this.schedule(signal, context, options);
      return;
    }

    this.addSignal(signal);
    this.execute(signal, context);
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

      this.emit("sub_meta.signal_broker.emitting_signal", { ...context });
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

      this.emit("meta.signal_broker.added", { signalName: _signal });
    }
  }

  /**
   * Lists all observed signals.
   * @returns Array of signals.
   */
  listObservedSignals(): string[] {
    return Array.from(this.signalObservers.keys());
  }

  listEmittedSignals(): string[] {
    return Array.from(this.emittedSignalsRegistry);
  }

  reset() {
    this.signalObservers.clear();
    this.emittedSignalsRegistry.clear();
  }
}
