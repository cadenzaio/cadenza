import Task from "./Task";
import Cadenza from "../../Cadenza";
import SignalEmitter from "../../interfaces/SignalEmitter";

export default class GraphRoutine extends SignalEmitter {
  readonly name: string;
  version: number = 1;
  readonly description: string;
  readonly isMeta: boolean = false;
  tasks: Set<Task> = new Set();
  registered: boolean = false;

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
      __routineInstance: this,
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
   * Applies callback to starting tasks.
   * @param callBack The callback.
   * @returns Promise if async.
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
   * Subscribes to signals (chainable).
   * @param signals The signal names.
   * @returns This for chaining.
   * @edge Duplicates ignored; assumes broker.observe binds this as handler.
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
   * Unsubscribes from all observed signals.
   * @returns This for chaining.
   */
  unsubscribeAll(): this {
    this.observedSignals.forEach((signal) =>
      Cadenza.broker.unsubscribe(signal, this as any),
    );
    this.observedSignals.clear();
    return this;
  }

  /**
   * Unsubscribes from specific signals.
   * @param signals The signals.
   * @returns This for chaining.
   * @edge No-op if not subscribed.
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
   * Destroys the routine.
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
