import { v4 as uuid } from "uuid";
import Task from "./Task";
import SignalParticipant from "../../interfaces/SignalParticipant";

export default class GraphRoutine extends SignalParticipant {
  readonly name: string;
  version: number = 1;
  readonly description: string;
  readonly isMeta: boolean = false;
  tasks: Set<Task> = new Set();

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
        description: this.description,
        isMeta: this.isMeta,
      },
      __routineInstance: this,
    });
    tasks.forEach((t) => {
      this.tasks.add(t);
      this.emit("meta.routine.task_added", {
        data: {
          taskName: t.name,
          taskVersion: t.version,
          routineName: this.name,
          routineVersion: this.version,
        },
      });
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

  // Removed emitsSignals per clarification (routines as listeners only)

  /**
   * Destroys the routine.
   */
  public destroy(): void {
    this.tasks.clear();
    this.emit("meta.routine.destroyed", {
      data: { deleted: true },
      filter: { name: this.name, version: this.version },
    });
  }
}
