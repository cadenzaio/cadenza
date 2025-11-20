import SignalBroker from "./engine/SignalBroker";
import GraphRunner from "./engine/GraphRunner";
import GraphRegistry from "./registry/GraphRegistry";
import Task, { TaskFunction, ThrottleTagGetter } from "./graph/definition/Task";
import DebounceTask, { DebounceOptions } from "./graph/definition/DebounceTask";
import EphemeralTask, {
  EphemeralTaskOptions,
} from "./graph/definition/EphemeralTask";
import GraphRoutine from "./graph/definition/GraphRoutine";
import GraphAsyncRun from "./engine/strategy/GraphAsyncRun";
import GraphStandardRun from "./engine/strategy/GraphStandardRun";
import { SchemaDefinition } from "./types/schema";
import { AnyObject } from "./types/global";

export interface TaskOptions {
  concurrency?: number;
  timeout?: number;
  register?: boolean;
  isUnique?: boolean;
  isMeta?: boolean;
  isSubMeta?: boolean;
  isHidden?: boolean;
  getTagCallback?: ThrottleTagGetter;
  inputSchema?: SchemaDefinition;
  validateInputContext?: boolean;
  outputSchema?: SchemaDefinition;
  validateOutputContext?: boolean;
  retryCount?: number;
  retryDelay?: number;
  retryDelayMax?: number;
  retryDelayFactor?: number;
}

export type CadenzaMode = "dev" | "debug" | "verbose" | "production";

/**
 * Represents the core class of the Cadenza framework managing tasks, meta-tasks, signal emissions, and execution strategies.
 * All core components such as SignalBroker, GraphRunner, and GraphRegistry are initialized through this class, and it provides
 * utility methods to create, register, and manage various task types.
 */
export default class Cadenza {
  public static broker: SignalBroker;
  public static runner: GraphRunner;
  public static metaRunner: GraphRunner;
  public static registry: GraphRegistry;
  static isBootstrapped = false;
  static mode: CadenzaMode = "production";

  /**
   * Initializes the system by setting up the required components such as the
   * signal broker, runners, and graph registry. Ensures the initialization
   * happens only once. Configures debug settings if applicable.
   *
   * @return {void} No value is returned.
   */
  public static bootstrap(): void {
    if (this.isBootstrapped) return;
    this.isBootstrapped = true;

    // 1. SignalBroker (empty, for observations)
    this.broker = SignalBroker.instance;

    // 2. Runners (now init broker with them)
    this.runner = new GraphRunner();
    this.metaRunner = new GraphRunner(true);
    this.broker.bootstrap(this.runner, this.metaRunner);

    if (this.mode === "debug" || this.mode === "dev") {
      this.broker.setDebug(true);
      this.runner.setDebug(true);
      this.metaRunner.setDebug(true);
    }

    // 3. GraphRegistry (seed observes on broker)
    this.registry = GraphRegistry.instance;

    // 4. Runners (create meta tasks)
    this.broker.init();
    this.runner.init();
    this.metaRunner.init();
  }

  /**
   * Retrieves the available strategies for running graphs.
   *
   * @return {Object} An object containing the available run strategies, where:
   *                  - PARALLEL: Executes graph runs asynchronously.
   *                  - SEQUENTIAL: Executes graph runs in a sequential order.
   */
  public static get runStrategy() {
    return {
      PARALLEL: new GraphAsyncRun(),
      SEQUENTIAL: new GraphStandardRun(),
    };
  }

  /**
   * Sets the mode for the application and configures the broker and runner settings accordingly.
   *
   * @param {CadenzaMode} mode - The mode to set. It can be one of the following:
   *                             "debug", "dev", "verbose", or "production".
   *                             Each mode adjusts debug and verbosity settings.
   * @return {void} This method does not return a value.
   */
  public static setMode(mode: CadenzaMode) {
    this.mode = mode;

    this.bootstrap();

    if (mode === "debug" || mode === "dev") {
      this.broker.setDebug(true);
      this.runner.setDebug(true);
    }

    if (mode === "verbose") {
      this.broker.setDebug(true);
      this.broker.setVerbose(true);
      this.runner.setDebug(true);
      this.runner.setVerbose(true);
    }

    if (mode === "production") {
      this.broker.setDebug(false);
      this.broker.setVerbose(false);
      this.runner.setDebug(false);
      this.runner.setVerbose(false);
    }
  }

  /**
   * Validates the given name to ensure it is a non-empty string.
   * Throws an error if the validation fails.
   *
   * @param {string} name - The name to validate.
   * @return {void} This method does not return anything.
   * @throws {Error} If the name is not a non-empty string.
   */
  public static validateName(name: string): void {
    if (!name || typeof name !== "string") {
      throw new Error("Task or Routine name must be a non-empty string.");
    }
    // Further uniqueness check delegated to GraphRegistry.register*
  }

  /**
   * Executes the specified task or GraphRoutine with the given context using an internal runner.
   *
   * @param {Task | GraphRoutine} task - The task or GraphRoutine to be executed.
   * @param {AnyObject} context - The context in which the task or GraphRoutine should be executed.
   * @return {void}
   *
   * @example
   * ```ts
   * const task = Cadenza.createTask('My task', (ctx) => {
   *   console.log('My task executed with context:', ctx);
   * });
   *
   * Cadenza.run(task, { foo: 'bar' });
   *
   * const routine = Cadenza.createRoutine('My routine', [task], 'My routine description');
   *
   * Cadenza.run(routine, { foo: 'bar' });
   * ```
   */
  public static run(task: Task | GraphRoutine, context: AnyObject) {
    this.runner?.run(task, context);
  }

  /**
   * Emits an event with the specified name and data payload to the broker.
   *
   * @param {string} event - The name of the event to emit.
   * @param {AnyObject} [data={}] - The data payload associated with the event.
   * @return {void} - No return value.
   *
   * @example
   * This is meant to be used as a global event emitter.
   * If you want to emit an event from within a task, you can use the `emit` method provided to the task function. See {@link TaskFunction}.
   * ```ts
   * Cadenza.emit('main.my_event', { foo: 'bar' });
   * ```
   */
  public static emit(event: string, data: AnyObject = {}) {
    this.broker?.emit(event, data);
  }

  /**
   * Creates and registers a new task with the specified parameters and options.
   * Tasks are the basic building blocks of Cadenza graphs and are responsible for executing logic.
   * See {@link Task} for more information.
   *
   * @param {string} name - The unique name of the task.
   * @param {TaskFunction} func - The function to be executed by the task.
   * @param {string} [description] - An optional description for the task.
   * @param {TaskOptions} [options={}] - Configuration options for the task, such as concurrency, timeout, and retry settings.
   * @return {Task} The created task instance.
   *
   * @example
   * You can use arrow functions to create tasks.
   * ```ts
   * const task = Cadenza.createTask('My task', (ctx) => {
   *   console.log('My task executed with context:', ctx);
   * }, 'My task description');
   * ```
   *
   * You can also use named functions to create tasks.
   * This is the preferred way to create tasks since it allows for code inspection in the CadenzaUI.
   * ```ts
   * function myTask(ctx) {
   *   console.log('My task executed with context:', ctx);
   * }
   *
   * const task = Cadenza.createTask('My task', myTask);
   * ```
   *
   * ** Use the TaskOptions object to configure the task. **
   *
   * With concurrency limit, timeout limit and retry settings.
   * ```ts
   * Cadenza.createTask('My task', (ctx) => {
   *   console.log('My task executed with context:', ctx);
   * }, 'My task description', {
   *   concurrency: 10,
   *   timeout: 10000,
   *   retryCount: 3,
   *   retryDelay: 1000,
   *   retryDelayFactor: 1.5,
   * });
   * ```
   *
   * You can specify the input and output context schemas for the task.
   * ```ts
   * Cadenza.createTask('My task', (ctx) => {
   *   return { bar: 'foo' + ctx.foo };
   * }, 'My task description', {
   *   inputContextSchema: {
   *     type: 'object',
   *     properties: {
   *       foo: {
   *         type: 'string',
   *       },
   *     },
   *   required: ['foo'],
   *   },
   *   validateInputContext: true, // default is false
   *   outputContextSchema: {
   *     type: 'object',
   *     properties: {
   *       bar: {
   *         type: 'string',
   *       },
   *     },
   *     required: ['bar'],
   *   },
   *   validateOutputContext: true, // default is false
   * });
   * ```
   */
  static createTask(
    name: string,
    func: TaskFunction,
    description?: string,
    options: TaskOptions = {},
  ): Task {
    this.bootstrap();
    this.validateName(name);

    options = {
      concurrency: 0,
      timeout: 0,
      register: true,
      isUnique: false,
      isMeta: false,
      isSubMeta: false,
      isHidden: false,
      getTagCallback: undefined,
      inputSchema: undefined,
      validateInputContext: false,
      outputSchema: undefined,
      validateOutputContext: false,
      retryCount: 0,
      retryDelay: 0,
      retryDelayMax: 0,
      retryDelayFactor: 1,
      ...options,
    };

    return new Task(
      name,
      func,
      description,
      options.concurrency,
      options.timeout,
      options.register,
      options.isUnique,
      options.isMeta,
      options.isSubMeta,
      options.isHidden,
      options.getTagCallback,
      options.inputSchema,
      options.validateInputContext,
      options.outputSchema,
      options.validateOutputContext,
      options.retryCount,
      options.retryDelay,
      options.retryDelayMax,
      options.retryDelayFactor,
    );
  }

  /**
   * Creates a meta task with the specified name, functionality, description, and options.
   * This is used for creating tasks that lives on the meta layer.
   * The meta layer is a special layer that is executed separately from the business logic layer and is used for extending Cadenzas core functionality.
   * See {@link Task} or {@link createTask} for more information.
   *
   * @param {string} name - The name of the meta task.
   * @param {TaskFunction} func - The function to be executed by the meta task.
   * @param {string} [description] - An optional description of the meta task.
   * @param {TaskOptions} [options={}] - Additional optional task configuration. Automatically sets `isMeta` to true.
   * @return {Task} A task instance configured as a meta task.
   */
  static createMetaTask(
    name: string,
    func: TaskFunction,
    description?: string,
    options: TaskOptions = {},
  ): Task {
    options.isMeta = true;
    return this.createTask(name, func, description, options);
  }

  /**
   * Creates a unique task by wrapping the provided task function with a uniqueness constraint.
   * Unique tasks are designed to execute once per execution ID, merging parents. This is useful for
   * tasks that require fan-in/joins after parallel branches.
   * See {@link Task} for more information.
   *
   * @param {string} name - The name of the task to be created.
   * @param {TaskFunction} func - The function that contains the logic for the task. It receives joinedContexts as a list in the context (context.joinedContexts).
   * @param {string} [description] - An optional description of the task.
   * @param {TaskOptions} [options={}] - Optional configuration for the task, such as additional metadata or task options.
   * @return {Task} The task instance that was created with a uniqueness constraint.
   *
   * @example
   * ```ts
   * const splitTask = Cadenza.createTask('Split foos', function* (ctx) {
   *   for (const foo of ctx.foos) {
   *     yield { foo };
   *   }
   * }, 'Splits a list of foos into multiple sub-branches');
   *
   * const processTask = Cadenza.createTask('Process foo', (ctx) => {
   *  return { bar: 'foo' + ctx.foo };
   * }, 'Process a foo');
   *
   * const uniqueTask = Cadenza.createUniqueTask('Gather processed foos', (ctx) => {
   *   // A unique task will always be provided with a list of contexts (ctx.joinedContexts) from its predecessors.
   *   const processedFoos = ctx.joinedContexts.map((c) => c.bar);
   *   return { foos: processedFoos };
   * }, 'Gathers together the processed foos.');
   *
   * splitTask.then(
   *   processTask.then(
   *     uniqueTask,
   *   ),
   * );
   *
   * // Give the flow a name using a routine
   * Cadenza.createRoutine(
   *   'Process foos',
   *   [splitTask],
   *   'Processes a list of foos'
   * ).doOn('main.received_foos'); // Subscribe to a signal
   *
   * // Trigger the flow from anywhere
   * Cadenza.emit('main.received_foos', { foos: ['foo1', 'foo2', 'foo3'] });
   * ```
   *
   */
  static createUniqueTask(
    name: string,
    func: TaskFunction,
    description?: string,
    options: TaskOptions = {},
  ): Task {
    options.isUnique = true;
    return this.createTask(name, func, description, options);
  }

  /**
   * Creates a unique meta task with the specified name, function, description, and options.
   * See {@link createUniqueTask} and {@link createMetaTask} for more information.
   *
   * @param {string} name - The name of the task to create.
   * @param {TaskFunction} func - The function to execute when the task is run.
   * @param {string} [description] - An optional description of the task.
   * @param {TaskOptions} [options={}] - Optional settings for the task. Defaults to an empty object. Automatically sets `isMeta` and `isUnique` to true.
   * @return {Task} The created unique meta task.
   */
  static createUniqueMetaTask(
    name: string,
    func: TaskFunction,
    description?: string,
    options: TaskOptions = {},
  ): Task {
    options.isMeta = true;
    options.isUnique = true;
    return this.createUniqueTask(name, func, description, options);
  }

  /**
   * Creates a throttled task with a concurrency limit of 1, ensuring that only one instance of the task can run at a time for a specific throttle tag.
   * This is useful for ensuring execution order and preventing race conditions.
   * See {@link Task} for more information.
   *
   * @param {string} name - The name of the task.
   * @param {TaskFunction} func - The function to be executed when the task runs.
   * @param {ThrottleTagGetter} [throttledIdGetter=() => "default"] - A function that generates a throttle tag identifier to group tasks for throttling.
   * @param {string} [description] - An optional description of the task.
   * @param {TaskOptions} [options={}] - Additional options to customize the task behavior.
   * @return {Task} The created throttled task.
   *
   * @example
   * ```ts
   * const task = Cadenza.createThrottledTask(
   *   'My task',
   *   async (ctx) => {
   *      await new Promise((resolve) => setTimeout(resolve, 1000));
   *      console.log('My task executed with context:', ctx);
   *   },
   *   // Will throttle by the value of ctx.foo to make sure tasks with the same value are executed sequentially
   *   (ctx) => ctx.foo,
   * );
   *
   * Cadenza.run(task, { foo: 'bar' }); // (First execution)
   * Cadenza.run(task, { foo: 'bar' }); // This will be executed after the first execution is finished
   * Cadenza.run(task, { foo: 'baz' }); // This will be executed in parallel with the first execution
   * ```
   */
  static createThrottledTask(
    name: string,
    func: TaskFunction,
    throttledIdGetter: ThrottleTagGetter = () => "default",
    description?: string,
    options: TaskOptions = {},
  ): Task {
    options.concurrency = 1;
    options.getTagCallback = throttledIdGetter;
    return this.createTask(name, func, description, options);
  }

  /**
   * Creates a throttled meta task with the specified configuration.
   * See {@link createThrottledTask} and {@link createMetaTask} for more information.
   *
   * @param {string} name - The name of the throttled meta task.
   * @param {TaskFunction} func - The task function to be executed.
   * @param {ThrottleTagGetter} throttledIdGetter - A function to retrieve the throttling identifier.
   * @param {string} [description] - An optional description of the task.
   * @param {TaskOptions} [options={}] - Additional options for configuring the task.
   * @return {Task} The created throttled meta task.
   */
  static createThrottledMetaTask(
    name: string,
    func: TaskFunction,
    throttledIdGetter: ThrottleTagGetter,
    description?: string,
    options: TaskOptions = {},
  ): Task {
    options.isMeta = true;
    return this.createThrottledTask(
      name,
      func,
      throttledIdGetter,
      description,
      options,
    );
  }

  /**
   * Creates and returns a new debounced task with the specified parameters.
   * This is useful to prevent rapid execution of tasks that may be triggered by multiple events within a certain time frame.
   * See {@link DebounceTask} for more information.
   *
   * @param {string} name - The unique name of the task to be created.
   * @param {TaskFunction} func - The function to be executed by the task.
   * @param {string} [description] - An optional description of the task.
   * @param {number} [debounceTime=1000] - The debounce time in milliseconds to delay the execution of the task.
   * @param {TaskOptions & DebounceOptions} [options={}] - Additional configuration options for the task, including debounce behavior and other task properties.
   * @return {DebounceTask} A new instance of the DebounceTask with the specified configuration.
   *
   * @example
   * ```ts
   * const task = Cadenza.createDebounceTask(
   *   'My debounced task',
   *   (ctx) => {
   *      console.log('My task executed with context:', ctx);
   *   },
   *   'My debounced task description',
   *   100, // Debounce time in milliseconds. Default is 1000
   *   {
   *     leading: false, // Should the first execution of a burst be executed immediately? Default is false
   *     trailing: true, // Should the last execution of a burst be executed? Default is true
   *     maxWait: 1000, // Maximum time in milliseconds to wait for the next execution. Default is 0
   *   },
   * );
   *
   * Cadenza.run(task, { foo: 'bar' }); // This will not be executed
   * Cadenza.run(task, { foo: 'bar' }); // This will not be executed
   * Cadenza.run(task, { foo: 'baz' }); // This execution will be delayed by 100ms
   * ```
   */
  static createDebounceTask(
    name: string,
    func: TaskFunction,
    description?: string,
    debounceTime: number = 1000,
    options: TaskOptions & DebounceOptions = {},
  ): DebounceTask {
    this.bootstrap();
    this.validateName(name);

    options = {
      concurrency: 0,
      timeout: 0,
      register: true,
      leading: false,
      trailing: true,
      maxWait: 0,
      isUnique: false,
      isMeta: false,
      isSubMeta: false,
      isHidden: false,
      inputSchema: undefined,
      validateInputContext: false,
      outputSchema: undefined,
      validateOutputContext: false,
      ...options,
    };

    return new DebounceTask(
      name,
      func,
      description,
      debounceTime,
      options.leading,
      options.trailing,
      options.maxWait,
      options.concurrency,
      options.timeout,
      options.register,
      options.isUnique,
      options.isMeta,
      options.isSubMeta,
      options.isHidden,
      options.inputSchema,
      options.validateInputContext,
      options.outputSchema,
      options.validateOutputContext,
    );
  }

  /**
   * Creates a debounced meta task with the specified parameters.
   * See {@link createDebounceTask} and {@link createMetaTask} for more information.
   *
   * @param {string} name - The name of the task.
   * @param {TaskFunction} func - The function to be executed by the task.
   * @param {string} [description] - Optional description of the task.
   * @param {number} [debounceTime=1000] - The debounce delay in milliseconds.
   * @param {TaskOptions & DebounceOptions} [options={}] - Additional configuration options for the task.
   * @return {DebounceTask} Returns an instance of the debounced meta task.
   */
  static createDebounceMetaTask(
    name: string,
    func: TaskFunction,
    description?: string,
    debounceTime: number = 1000,
    options: TaskOptions & DebounceOptions = {},
  ): DebounceTask {
    options.isMeta = true;
    return this.createDebounceTask(
      name,
      func,
      description,
      debounceTime,
      options,
    );
  }

  /**
   * Creates an ephemeral task with the specified configuration.
   * Ephemeral tasks are designed to self-destruct after execution or a certain condition is met.
   * This is useful for transient tasks such as resolving promises or performing cleanup operations.
   * They are not registered by default.
   * See {@link EphemeralTask} for more information.
   *
   * @param {string} name - The name of the task to be created.
   * @param {TaskFunction} func - The function that defines the logic of the task.
   * @param {string} [description] - An optional description of the task.
   * @param {TaskOptions & EphemeralTaskOptions} [options={}] - The configuration options for the task, including concurrency, timeouts, and retry policies.
   * @return {EphemeralTask} The created ephemeral task instance.
   *
   * @example
   * By default, ephemeral tasks are executed once and destroyed after execution.
   * ```ts
   * const task = Cadenza.createEphemeralTask('My ephemeral task', (ctx) => {
   *   console.log('My task executed with context:', ctx);
   * });
   *
   * Cadenza.run(task); // Executes the task once and destroys it after execution
   * Cadenza.run(task); // Does nothing, since the task is destroyed
   * ```
   *
   * Use destroy condition to conditionally destroy the task
   * ```ts
   * const task = Cadenza.createEphemeralTask(
   *   'My ephemeral task',
   *   (ctx) => {
   *      console.log('My task executed with context:', ctx);
   *   },
   *   'My ephemeral task description',
   *   {
   *     once: false, // Should the task be executed only once? Default is true
   *     destroyCondition: (ctx) => ctx.foo > 10, // Should the task be destroyed after execution? Default is undefined
   *   },
   * );
   *
   * Cadenza.run(task, { foo: 5 }); // The task will not be destroyed and can still be executed
   * Cadenza.run(task, { foo: 10 }); // The task will not be destroyed and can still be executed
   * Cadenza.run(task, { foo: 20 }); // The task will be destroyed after execution and cannot be executed anymore
   * Cadenza.run(task, { foo: 30 }); // This will not be executed
   * ```
   *
   * A practical use case for ephemeral tasks is to resolve a promise upon some external event.
   * ```ts
   * const task = Cadenza.createTask('Confirm something', (ctx, emit) => {
   *   return new Promise((resolve) => {
   *     ctx.foo = uuid();
   *
   *     Cadenza.createEphemeralTask(`Resolve promise of ${ctx.foo}`, (c) => {
   *       console.log('My task executed with context:', ctx);
   *       resolve(c);
   *     }).doOn(`socket.confirmation_received:${ctx.foo}`);
   *
   *     emit('this_domain.confirmation_requested', ctx);
   *   });
   * });
   * ```
   */
  static createEphemeralTask(
    name: string,
    func: TaskFunction,
    description?: string,
    options: TaskOptions & EphemeralTaskOptions = {},
  ): EphemeralTask {
    this.bootstrap();
    this.validateName(name);

    options = {
      concurrency: 0,
      timeout: 0,
      register: true,
      isUnique: false,
      isMeta: false,
      isSubMeta: false,
      isHidden: false,
      once: true,
      destroyCondition: () => true,
      getTagCallback: undefined,
      inputSchema: undefined,
      validateInputContext: false,
      outputSchema: undefined,
      validateOutputContext: false,
      retryCount: 0,
      retryDelay: 0,
      retryDelayMax: 0,
      retryDelayFactor: 1,
      ...options,
    };

    return new EphemeralTask(
      name,
      func,
      description,
      options.once,
      options.destroyCondition,
      options.concurrency,
      options.timeout,
      options.register,
      options.isUnique,
      options.isMeta,
      options.isSubMeta,
      options.isHidden,
      options.getTagCallback,
      options.inputSchema,
      options.validateInputContext,
      options.outputSchema,
      options.validateOutputContext,
      options.retryCount,
      options.retryDelay,
      options.retryDelayMax,
      options.retryDelayFactor,
    );
  }

  /**
   * Creates an ephemeral meta task with the specified name, function, description, and options.
   * See {@link createEphemeralTask} and {@link createMetaTask} for more details.
   *
   * @param {string} name - The name of the task to be created.
   * @param {TaskFunction} func - The function to be executed as part of the task.
   * @param {string} [description] - An optional description of the task.
   * @param {TaskOptions & EphemeralTaskOptions} [options={}] - Additional options for configuring the task.
   * @return {EphemeralTask} The created ephemeral meta task.
   */
  static createEphemeralMetaTask(
    name: string,
    func: TaskFunction,
    description?: string,
    options: TaskOptions & EphemeralTaskOptions = {},
  ): EphemeralTask {
    options.isMeta = true;
    return this.createEphemeralTask(name, func, description, options);
  }

  /**
   * Creates a new routine with the specified name, tasks, and an optional description.
   * Routines are named entry points to starting tasks and are registered in the GraphRegistry.
   * They are used to group tasks together and provide a high-level structure for organizing and managing the execution of a set of tasks.
   * See {@link GraphRoutine} for more information.
   *
   * @param {string} name - The name of the routine to create.
   * @param {Task[]} tasks - A list of tasks to include in the routine.
   * @param {string} [description=""] - An optional description for the routine.
   * @return {GraphRoutine} A new instance of the GraphRoutine containing the specified tasks and description.
   *
   * @example
   * ```ts
   * const task1 = Cadenza.createTask("Task 1", () => {});
   * const task2 = Cadenza.createTask("Task 2", () => {});
   *
   * task1.then(task2);
   *
   * const routine = Cadenza.createRoutine("Some routine", [task1]);
   *
   * Cadenza.run(routine);
   *
   * // Or, routines can be triggered by signals
   * routine.doOn("some.signal");
   *
   * Cadenza.emit("some.signal", {});
   * ```
   */
  static createRoutine(
    name: string,
    tasks: Task[],
    description: string = "",
  ): GraphRoutine {
    this.bootstrap();
    this.validateName(name);
    if (tasks.length === 0) {
      throw new Error(`Routine '${name}' created with no starting tasks.`);
    }
    return new GraphRoutine(name, tasks, description);
  }

  /**
   * Creates a meta routine with a given name, tasks, and optional description.
   * Routines are named entry points to starting tasks and are registered in the GraphRegistry.
   * They are used to group tasks together and provide a high-level structure for organizing and managing the execution of a set of tasks.
   * See {@link GraphRoutine} and {@link createRoutine} for more information.
   *
   * @param {string} name - The name of the routine to be created.
   * @param {Task[]} tasks - An array of tasks that the routine will consist of.
   * @param {string} [description=""] - An optional description for the routine.
   * @return {GraphRoutine} A new instance of the `GraphRoutine` representing the created routine.
   * @throws {Error} If no starting tasks are provided.
   */
  static createMetaRoutine(
    name: string,
    tasks: Task[],
    description: string = "",
  ): GraphRoutine {
    this.bootstrap();
    this.validateName(name);
    if (tasks.length === 0) {
      throw new Error(`Routine '${name}' created with no starting tasks.`);
    }
    return new GraphRoutine(name, tasks, description, true);
  }

  static reset() {
    this.broker?.reset();
    this.registry?.reset();
    this.isBootstrapped = false;
  }
}
