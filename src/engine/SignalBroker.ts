import GraphRunner from "./GraphRunner";
import { AnyObject, ThrottleHandle } from "../types/global";
import Task from "../graph/definition/Task";
import GraphRoutine from "../graph/definition/GraphRoutine";
import { formatTimestamp } from "../utils/tools";
import { v4 as uuid } from "uuid";
import debounce from "lodash-es/debounce";
import { sleep } from "../utils/promise";
import Cadenza from "../Cadenza";
import merge from "lodash-es/merge";

export interface EmitOptions {
  squash?: boolean;
  squashId?: string | null;
  groupId?: string | null;
  mergeFunction?:
    | ((oldContext: AnyObject, ...newContext: AnyObject[]) => AnyObject)
    | null;
  debounce?: boolean;
  throttle?: boolean;
  delayMs?: number;
  schedule?: boolean;
  exactDateTime?: Date | null;
  throttleBatch?: number;
  flushStrategy?: string; // New: choose which flush interval bucket to use
}

type FlushStrategyName = string;

interface FlushStrategy {
  intervalMs: number;
  maxBatchSize: number;
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

  runner: GraphRunner | undefined;
  metaRunner: GraphRunner | undefined;

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

  // ── Flush Strategy Management ───────────────────────────────────────
  private flushStrategies = new Map<FlushStrategyName, FlushStrategy>();
  private strategyData = new Map<
    FlushStrategyName,
    Map<string, { signal: string; contexts: AnyObject[] }>
  >();
  private strategyTimers = new Map<FlushStrategyName, NodeJS.Timeout | null>();
  private isStrategyFlushing = new Map<FlushStrategyName, boolean>();

  private readonly defaultStrategyName = "default";

  constructor() {
    this.addSignal("meta.signal_broker.added");
    // Register default strategy
    this.setFlushStrategy(this.defaultStrategyName, {
      intervalMs: 350,
      maxBatchSize: 80,
    });
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
  validateSignalName(signalName: string): void {
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
  init(): void {
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

  setFlushStrategy(
    name: FlushStrategyName,
    config: { intervalMs: number; maxBatchSize?: number },
  ): void {
    if (config.intervalMs < 50) {
      throw new Error("intervalMs must be >= 50ms for performance reasons");
    }

    this.flushStrategies.set(name, {
      intervalMs: config.intervalMs,
      maxBatchSize: config.maxBatchSize ?? 80,
    });

    if (!this.strategyData.has(name)) {
      this.strategyData.set(name, new Map());
      this.strategyTimers.set(name, null);
      this.isStrategyFlushing.set(name, false);
    }
  }

  updateFlushStrategy(name: FlushStrategyName, config: FlushStrategy): void {
    if (!this.flushStrategies.get(name)) {
      return this.setFlushStrategy(name, config);
    }

    this.flushStrategies.set(name, config);
  }

  removeFlushStrategy(name: FlushStrategyName): void {
    if (name === this.defaultStrategyName) {
      throw new Error("Cannot remove default strategy");
    }
    const timer = this.strategyTimers.get(name);
    if (timer) clearTimeout(timer);
    this.strategyTimers.delete(name);
    this.strategyData.delete(name);
    this.isStrategyFlushing.delete(name);
    this.flushStrategies.delete(name);
  }

  getFlushStrategies(): Record<FlushStrategyName, FlushStrategy> {
    return Object.fromEntries(this.flushStrategies);
  }

  // ── Squash (Multi-strategy) ─────────────────────────────────────────
  private readonly MAX_FLUSH_DURATION_MS = 120;

  squash(
    signal: string,
    context: AnyObject,
    options: EmitOptions = { squash: true },
  ): void {
    if (!options.squash) {
      this.emit(signal, context, options);
      return;
    }

    const strategyName = options.flushStrategy ?? this.defaultStrategyName;
    const strategy = this.flushStrategies.get(strategyName);

    if (!strategy) {
      console.warn(
        `Unknown flush strategy '${strategyName}', falling back to default`,
      );
      return this.squash(signal, context, {
        ...options,
        flushStrategy: this.defaultStrategyName,
      });
    }

    const squashId = options.squashId ?? signal;

    let groups = this.strategyData.get(strategyName)!;
    let data = groups.get(squashId);

    if (!data) {
      data = { signal, contexts: [] };
      groups.set(squashId, data);
    }

    data.contexts.push(context);

    if (data.contexts.length >= strategy.maxBatchSize) {
      this.flushGroup(strategyName, squashId, options);
      return;
    }

    if (
      !this.strategyTimers.get(strategyName) &&
      !this.isStrategyFlushing.get(strategyName)
    ) {
      this.strategyTimers.set(
        strategyName,
        setTimeout(() => this.flushStrategy(strategyName), strategy.intervalMs),
      );
    }
  }

  private flushGroup(
    strategyName: FlushStrategyName,
    squashId: string,
    options: EmitOptions,
  ): void {
    const groups = this.strategyData.get(strategyName);
    if (!groups) return;

    const data = groups.get(squashId);
    if (!data || data.contexts.length === 0) return;

    const start = performance.now();

    const merged = options.mergeFunction
      ? options.mergeFunction(data.contexts[0], ...data.contexts.slice(1))
      : merge({}, ...data.contexts);

    groups.delete(squashId);

    this.emit(data.signal, merged, { ...options, squash: false });

    const duration = performance.now() - start;
    if (duration > this.MAX_FLUSH_DURATION_MS) {
      console.warn(
        `Squash flush for ${data.signal} in group ${squashId} took ${duration.toFixed(1)}ms`,
      );
    }
  }

  private flushStrategy(strategyName: FlushStrategyName): void {
    this.strategyTimers.set(strategyName, null);
    this.isStrategyFlushing.set(strategyName, true);

    const groups = this.strategyData.get(strategyName);
    if (!groups || groups.size === 0) {
      this.isStrategyFlushing.set(strategyName, false);
      return;
    }

    const keys = Array.from(groups.keys());

    for (const squashId of keys) {
      if (groups.has(squashId)) {
        this.flushGroup(strategyName, squashId, {});
      }
    }

    this.isStrategyFlushing.set(strategyName, false);

    if (groups.size > 0) {
      const strategy = this.flushStrategies.get(strategyName)!;
      this.strategyTimers.set(
        strategyName,
        setTimeout(() => this.flushStrategy(strategyName), strategy.intervalMs),
      );
    }
  }

  public clearSquashState(): void {
    for (const [name, timer] of this.strategyTimers.entries()) {
      if (timer) clearTimeout(timer);
    }
    this.strategyTimers.clear();
    this.strategyData.clear();
    this.isStrategyFlushing.clear();
  }

  // ── Schedule (Bucketed) ─────────────────────────────────────────────
  private scheduledBuckets = new Map<
    number,
    Array<{ signal: string; context: AnyObject }>
  >();
  private scheduleTimer: NodeJS.Timeout | null = null;

  schedule(
    signal: string,
    context: AnyObject,
    options: EmitOptions = { delayMs: 60_000 },
  ): AbortController {
    let delay = options.delayMs ?? 0;
    if (options.exactDateTime) {
      delay = options.exactDateTime.getTime() - Date.now();
    }
    delay = Math.max(0, delay);

    // Bucket by 100ms granularity
    const bucketKey = Math.ceil(delay / 100) * 100;

    let bucket = this.scheduledBuckets.get(bucketKey);
    if (!bucket) {
      bucket = [];
      this.scheduledBuckets.set(bucketKey, bucket);
    }

    bucket.push({ signal, context });

    const controller = new AbortController();

    if (!this.scheduleTimer) {
      this.scheduleTimer = setTimeout(() => this.flushScheduled(), 50);
    }

    return controller;
  }

  private flushScheduled(): void {
    this.scheduleTimer = null;

    const now = Date.now();
    const toProcess: [number, Array<{ signal: string; context: AnyObject }>][] =
      [];

    for (const [bucketKey, items] of this.scheduledBuckets.entries()) {
      const bucketTime = bucketKey;
      if (now >= bucketTime - 150) {
        // tolerance
        toProcess.push([bucketKey, items]);
      }
    }

    for (const [key, items] of toProcess) {
      this.scheduledBuckets.delete(key);
      for (const item of items) {
        this.emit(item.signal, item.context);
      }
    }

    if (this.scheduledBuckets.size > 0) {
      this.scheduleTimer = setTimeout(() => this.flushScheduled(), 50);
    }
  }

  // ── Debounce (with cap) ─────────────────────────────────────────────
  private debouncedEmitters = new Map<
    string,
    {
      debouncedFn: ReturnType<typeof debounce>;
      idleTimeout: NodeJS.Timeout | null;
    }
  >();

  private readonly MAX_DEBOUNCERS = 5000;

  debounce(signal: string, context: any, options = { delayMs: 500 }) {
    if (this.debouncedEmitters.size > this.MAX_DEBOUNCERS) {
      console.warn("Max debouncers reached - evicting oldest");
      const oldestKey = this.debouncedEmitters.keys().next().value;
      if (oldestKey) {
        const entry = this.debouncedEmitters.get(oldestKey)!;
        entry.debouncedFn.flush();
        this.debouncedEmitters.delete(oldestKey);
      }
    }

    const delay = options.delayMs ?? 300;
    const key = signal;

    let entry = this.debouncedEmitters.get(key);

    if (!entry) {
      const debouncedFn = debounce(
        (ctx: any) => {
          this.emit(signal, ctx);
          entry!.idleTimeout = setTimeout(() => {
            this.debouncedEmitters.delete(key);
          }, delay * 4);
        },
        delay,
        { leading: false, trailing: true },
      );

      entry = { debouncedFn, idleTimeout: null };
      this.debouncedEmitters.set(key, entry);
    }

    if (entry.idleTimeout) {
      clearTimeout(entry.idleTimeout);
      entry.idleTimeout = null;
    }

    entry.debouncedFn(context);
  }

  // ── Existing throttle, interval, etc. remain unchanged ──────────────
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
            this.emit(nextSignal, nextContext);
          }
          await sleep(delayMs);
        }
        this.throttleEmitters.delete(groupId);
        this.throttleQueues.delete(groupId);
      });

      this.throttleEmitters.get(groupId)!();
    }
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

  public shutdown(): void {
    this.clearSquashState();
    this.reset();
  }
}
