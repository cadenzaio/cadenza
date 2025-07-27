import SignalBroker from "./engine/SignalBroker";
import GraphRunner from "./engine/GraphRunner";
import GraphRegistry from "./registry/GraphRegistry";
import Task, { TaskFunction } from "./graph/definition/Task";
import MetaTask from "./graph/definition/meta/MetaTask";
import UniqueTask from "./graph/definition/UniqueTask";
import UniqueMetaTask from "./graph/definition/meta/UniqueMetaTask";
import ThrottledTask, {
  ThrottleTagGetter,
} from "./graph/definition/ThrottledTask";
import ThrottledMetaTask from "./graph/definition/meta/ThrottledMetaTask";
import DebounceTask, { DebounceOptions } from "./graph/definition/DebounceTask";
import DebouncedMetaTask from "./graph/definition/meta/DebouncedMetaTask";
import EphemeralTask from "./graph/definition/EphemeralTask";
import EphemeralMetaTask from "./graph/definition/meta/EphemeralMetaTask";
import GraphRoutine from "./graph/definition/GraphRoutine";
import MetaRoutine from "./graph/definition/meta/MetaRoutine";
import GraphAsyncRun from "./engine/strategy/GraphAsyncRun";
import GraphStandardRun from "./engine/strategy/GraphStandardRun";

export interface TaskOptions {
  concurrency?: number;
  timeout?: number;
  register?: boolean;
}

export default class Cadenza {
  static broker: SignalBroker;
  static runner: GraphRunner;
  static metaRunner: GraphRunner;
  static registry: GraphRegistry;
  private static isBootstrapped = false;

  private static bootstrap(): void {
    if (this.isBootstrapped) return;
    this.isBootstrapped = true;

    // 1. SignalBroker (empty, for observations)
    this.broker = SignalBroker.instance;

    // 2. Runners (now init broker with them)
    this.runner = new GraphRunner();
    this.metaRunner = new GraphRunner(true);
    this.broker.init(this.runner, this.metaRunner);

    // 3. GraphRegistry (seed observes on broker)
    this.registry = GraphRegistry.instance;

    // 4. Runners (create meta tasks)
    this.runner.init();
    this.metaRunner.init();
  }

  public static get runStrategy() {
    return {
      PARALLEL: new GraphAsyncRun(),
      SEQUENTIAL: new GraphStandardRun(),
    };
  }

  /**
   * Validates a name for uniqueness and non-emptiness.
   * @param name The name to validate.
   * @throws Error if invalid.
   */
  private static validateName(name: string): void {
    if (!name || typeof name !== "string") {
      throw new Error("Task or Routine name must be a non-empty string.");
    }
    // Further uniqueness check delegated to GraphRegistry.register*
  }

  /**
   * Creates a standard Task and registers it in the GraphRegistry.
   * @param name Unique identifier for the task.
   * @param func The function or async generator to execute.
   * @param description Optional human-readable description for introspection.
   * @param options Optional task options.
   * @returns The created Task instance.
   * @throws Error if name is invalid or duplicate in registry.
   */
  static createTask(
    name: string,
    func: TaskFunction,
    description?: string,
    options: TaskOptions = {
      concurrency: 0,
      timeout: 0,
      register: true,
    },
  ): Task {
    this.bootstrap();
    this.validateName(name);
    return new Task(
      name,
      func,
      description,
      options.concurrency,
      options.timeout,
      options.register,
    );
  }

  /**
   * Creates a MetaTask (for meta-layer graphs) and registers it.
   * MetaTasks suppress further meta-signal emissions to prevent loops.
   * @param name Unique identifier for the meta-task.
   * @param func The function or async generator to execute.
   * @param description Optional description.
   * @param options Optional task options.
   * @returns The created MetaTask instance.
   * @throws Error if name invalid or duplicate.
   */
  static createMetaTask(
    name: string,
    func: TaskFunction,
    description?: string,
    options: TaskOptions = {
      concurrency: 0,
      timeout: 0,
      register: true,
    },
  ): MetaTask {
    this.bootstrap();
    this.validateName(name);
    return new MetaTask(
      name,
      func,
      description,
      options.concurrency,
      options.timeout,
      options.register,
    );
  }

  /**
   * Creates a UniqueTask (executes once per execution ID, merging parents) and registers it.
   * Use for fan-in/joins after parallel branches.
   * @param name Unique identifier.
   * @param func Function receiving joinedContexts.
   * @param description Optional description.
   * @param options Optional task options.
   * @returns The created UniqueTask.
   * @throws Error if invalid.
   */
  static createUniqueTask(
    name: string,
    func: TaskFunction,
    description?: string,
    options: TaskOptions = {
      concurrency: 0,
      timeout: 0,
      register: true,
    },
  ): UniqueTask {
    this.bootstrap();
    this.validateName(name);
    return new UniqueTask(
      name,
      func,
      description,
      options.concurrency,
      options.timeout,
      options.register,
    );
  }

  /**
   * Creates a UniqueMetaTask for meta-layer joins.
   * @param name Unique identifier.
   * @param func Function.
   * @param description Optional.
   * @param options Optional task options.
   * @returns The created UniqueMetaTask.
   */
  static createUniqueMetaTask(
    name: string,
    func: TaskFunction,
    description?: string,
    options: TaskOptions = {
      concurrency: 0,
      timeout: 0,
      register: true,
    },
  ): UniqueMetaTask {
    this.bootstrap();
    this.validateName(name);
    return new UniqueMetaTask(
      name,
      func,
      description,
      options.concurrency,
      options.timeout,
      options.register,
    );
  }

  /**
   * Creates a ThrottledTask (rate-limited by concurrency or custom groups) and registers it.
   * @param name Unique identifier.
   * @param func Function.
   * @param throttledIdGetter Optional getter for dynamic grouping (e.g., per-user).
   * @param description Optional.
   * @param options Optional task options.
   * @returns The created ThrottledTask.
   * @edge If no getter, throttles per task ID; use for resource protection.
   */
  static createThrottledTask(
    name: string,
    func: TaskFunction,
    throttledIdGetter?: ThrottleTagGetter,
    description?: string,
    options: TaskOptions = {
      concurrency: 1,
      timeout: 0,
      register: true,
    },
  ): ThrottledTask {
    this.bootstrap();
    this.validateName(name);
    return new ThrottledTask(
      name,
      func,
      description,
      throttledIdGetter,
      options.concurrency,
      options.timeout,
      options.register,
    );
  }

  /**
   * Creates a ThrottledMetaTask for meta-layer throttling.
   * @param name Identifier.
   * @param func Function.
   * @param throttledIdGetter Optional getter.
   * @param description Optional.
   * @param options Optional task options.
   * @returns The created ThrottledMetaTask.
   */
  static createThrottledMetaTask(
    name: string,
    func: TaskFunction,
    throttledIdGetter?: ThrottleTagGetter,
    description?: string,
    options: TaskOptions = {
      concurrency: 0,
      timeout: 0,
      register: true,
    },
  ): ThrottledMetaTask {
    this.bootstrap();
    this.validateName(name);
    return new ThrottledMetaTask(
      name,
      func,
      description,
      throttledIdGetter,
      options.concurrency,
      options.timeout,
      options.register,
    );
  }

  /**
   * Creates a DebounceTask (delays exec until quiet period) and registers it.
   * @param name Identifier.
   * @param func Function.
   * @param description Optional.
   * @param debounceTime Delay in ms (default 1000).
   * @param options Optional task options plus optional debounce config (e.g., leading/trailing).
   * @returns The created DebounceTask.
   * @edge Multiple triggers within time collapse to one exec.
   */
  static createDebounceTask(
    name: string,
    func: TaskFunction,
    description?: string,
    debounceTime: number = 1000,
    options: TaskOptions & DebounceOptions = {
      concurrency: 0,
      timeout: 0,
      register: true,
      leading: false,
      trailing: true,
    },
  ): DebounceTask {
    this.bootstrap();
    this.validateName(name);
    return new DebounceTask(
      name,
      func,
      description,
      debounceTime,
      options.leading,
      options.trailing,
      options.concurrency,
      options.timeout,
      options.register,
    );
  }

  /**
   * Creates a DebouncedMetaTask for meta-layer debouncing.
   * @param name Identifier.
   * @param func Function.
   * @param description Optional.
   * @param debounceTime Delay in ms.
   * @param options Optional task options plus optional debounce config (e.g., leading/trailing).
   * @returns The created DebouncedMetaTask.
   */
  static createDebounceMetaTask(
    name: string,
    func: TaskFunction,
    description?: string,
    debounceTime: number = 1000,
    options: TaskOptions & DebounceOptions = {
      concurrency: 0,
      timeout: 0,
      register: true,
      leading: false,
      trailing: true,
    },
  ): DebouncedMetaTask {
    this.bootstrap();
    this.validateName(name);
    return new DebouncedMetaTask(
      name,
      func,
      description,
      debounceTime,
      options.leading,
      options.trailing,
      options.concurrency,
      options.timeout,
      options.register,
    );
  }

  /**
   * Creates an EphemeralTask (self-destructs after exec or condition) without default registration.
   * Useful for transients; optionally register if needed.
   * @param name Identifier (may not be unique if not registered).
   * @param func Function.
   * @param description Optional.
   * @param once Destroy after first exec (default true).
   * @param destroyCondition Predicate for destruction (default always true).
   * @param options Optional task options.
   * @returns The created EphemeralTask.
   * @edge Destruction triggered post-exec via Node/Builder; emits meta-signal for cleanup.
   */
  static createEphemeralTask(
    name: string,
    func: TaskFunction,
    description?: string,
    once: boolean = true,
    destroyCondition: (context: any) => boolean = () => true,
    options: TaskOptions = {
      concurrency: 0,
      timeout: 0,
      register: true,
    },
  ): EphemeralTask {
    this.bootstrap();
    this.validateName(name);
    return new EphemeralTask(
      name,
      func,
      description,
      once,
      destroyCondition,
      options.concurrency,
      options.timeout,
      options.register,
    );
  }

  /**
   * Creates an EphemeralMetaTask for meta-layer transients.
   * @param name Identifier.
   * @param func Function.
   * @param description Optional.
   * @param once Destroy after first (default true).
   * @param destroyCondition Destruction predicate.
   * @param options Optional task options.
   * @returns The created EphemeralMetaTask.
   */
  static createEphemeralMetaTask(
    name: string,
    func: TaskFunction,
    description?: string,
    once: boolean = true,
    destroyCondition: (context: any) => boolean = () => true,
    options: TaskOptions = {
      concurrency: 0,
      timeout: 0,
      register: true,
    },
  ): EphemeralMetaTask {
    this.bootstrap();
    this.validateName(name);
    return new EphemeralMetaTask(
      name,
      func,
      description,
      once,
      destroyCondition,
      options.concurrency,
      options.timeout,
      options.register,
    );
  }

  /**
   * Creates a GraphRoutine (named entry to starting tasks) and registers it.
   * @param name Unique identifier.
   * @param tasks Starting tasks (can be empty, but warns as no-op).
   * @param description Optional.
   * @returns The created GraphRoutine.
   * @edge If tasks empty, routine is valid but inert.
   */
  static createRoutine(
    name: string,
    tasks: Task[],
    description: string = "",
  ): GraphRoutine {
    this.bootstrap();
    this.validateName(name);
    if (tasks.length === 0) {
      console.warn(`Routine '${name}' created with no starting tasks (no-op).`);
    }
    return new GraphRoutine(name, tasks, description);
  }

  /**
   * Creates a MetaRoutine for meta-layer entry points.
   * @param name Identifier.
   * @param tasks Starting tasks.
   * @param description Optional.
   * @returns The created MetaRoutine.
   */
  static createMetaRoutine(
    name: string,
    tasks: Task[],
    description: string = "",
  ): MetaRoutine {
    this.bootstrap();
    this.validateName(name);
    if (tasks.length === 0) {
      console.warn(`MetaRoutine '${name}' created with no starting tasks.`);
    }
    return new MetaRoutine(name, tasks, description);
  }

  static reset() {
    this.broker?.reset();
    this.registry?.reset();
  }
}
