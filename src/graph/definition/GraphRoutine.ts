import Task from "./Task";
import Cadenza from "../../Cadenza";
import SignalEmitter from "../../interfaces/SignalEmitter";

/**
 * Represents a routine in a graph structure with tasks and signal observation capabilities.
 * Routines are named entrypoint for a sub-graph, describing the purpose for the subsequent flow.
 * Since Task names are specific to the task it performs, it doesn't describe the overall flow.
 * Routines, therefore are used to assign names to sub-flows that can be referenced using that name instead of the name of the task(s).
 * Extends SignalEmitter to emit and handle signals related to the routine's lifecycle and tasks.
 */
export default class GraphRoutine extends SignalEmitter {
  readonly name: string;
  version: number = 1;
  readonly description: string;
  readonly isMeta: boolean = false;
  tasks: Set<Task> = new Set();
  registered: boolean = false;
  registeredTasks: Set<Task> = new Set();

  observedSignals: Set<string> = new Set();

  constructor(
    name: string,
    tasks: Task[],
    description: string,
    isMeta: boolean = false,
  ) {
    super();
    this.name = name;
    this.description = description;
    this.isMeta = isMeta;
    this.emit("meta.routine.created", {
      data: {
        name: this.name,
        version: this.version,
        description: this.description,
        isMeta: this.isMeta,
      },
      routineInstance: this,
    });
    tasks.forEach((t) => {
      this.tasks.add(t);

      const tasks = t.getIterator();

      while (tasks.hasNext()) {
        const task = tasks.next();
        if (!task) break;
        this.emit("meta.routine.task_added", {
          data: {
            taskName: task.name,
            taskVersion: task.version,
            routineName: this.name,
            routineVersion: this.version,
          },
        });
      }
    });
  }

  /**
   * Iterates over each task in the `tasks` collection and applies the provided callback function.
   * If the callback returns a Promise, resolves all Promises concurrently.
   *
   * @param {function} callBack - A function to be executed on each task from the `tasks` collection.
   *                              The callback receives the current task as its argument.
   * @return {Promise<void>} A Promise that resolves once all callback executions, including asynchronous ones, are complete.
   */
  public async forEachTask(callBack: (task: Task) => any): Promise<void> {
    const promises = [];
    for (const task of this.tasks) {
      const res = callBack(task);
      if (res instanceof Promise) promises.push(res);
    }
    await Promise.all(promises);
  }

  /**
   * Sets global Version.
   * @param version The Version.
   */
  public setVersion(version: number): void {
    this.version = version;
    this.emit("meta.routine.global_version_set", { version: this.version });
  }

  /**
   * Subscribes the current instance to the specified signals, enabling it to observe them.
   *
   * @param {...string} signals - The names of the signals to observe.
   * @return {this} Returns the instance to allow for method chaining.
   */
  doOn(...signals: string[]): this {
    signals.forEach((signal) => {
      if (this.observedSignals.has(signal)) return;
      Cadenza.broker.observe(signal, this as any);
      this.observedSignals.add(signal);
    });
    return this;
  }

  /**
   * Unsubscribes from all observed signals and clears the internal collection
   * of observed signals. This ensures that the instance is no longer listening
   * or reacting to any previously subscribed signals.
   *
   * @return {this} Returns the current instance for chaining purposes.
   */
  unsubscribeAll(): this {
    this.observedSignals.forEach((signal) =>
      Cadenza.broker.unsubscribe(signal, this as any),
    );
    this.observedSignals.clear();
    return this;
  }

  /**
   * Unsubscribes the current instance from the specified signals.
   *
   * @param {...string} signals - The signals to unsubscribe from.
   * @return {this} The current instance for method chaining.
   */
  unsubscribe(...signals: string[]): this {
    signals.forEach((signal) => {
      if (this.observedSignals.has(signal)) {
        Cadenza.broker.unsubscribe(signal, this as any);
        this.observedSignals.delete(signal);
      }
    });
    return this;
  }

  /**
   * Cleans up resources and emits an event indicating the destruction of the routine.
   *
   * This method unsubscribes from all events, clears the tasks list,
   * and emits a "meta.routine.destroyed" event with details of the destruction.
   *
   * @return {void}
   */
  public destroy(): void {
    this.unsubscribeAll();
    this.tasks.clear();
    this.emit("meta.routine.destroyed", {
      data: { deleted: true },
      filter: { name: this.name, version: this.version },
    });
  }
}
