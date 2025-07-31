import { v4 as uuid } from "uuid";
import Task from "./Task";
import SignalParticipant from "../../interfaces/SignalParticipant";

export default class GraphRoutine extends SignalParticipant {
  id: string;
  readonly name: string;
  readonly description: string;
  readonly isMeta: boolean = false;
  private tasks: Set<Task> = new Set();

  constructor(
    name: string,
    tasks: Task[],
    description: string,
    isMeta: boolean = false,
  ) {
    super();
    this.id = uuid();
    this.name = name;
    this.description = description;
    this.isMeta = isMeta;
    tasks.forEach((t) => this.tasks.add(t));
    this.emit("meta.routine.created", { __routine: this });
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
   * Sets global ID.
   * @param id The ID.
   */
  public setGlobalId(id: string): void {
    const oldId = this.id;
    this.id = id;
    this.emit("meta.routine.global_id_set", { __id: this.id, __oldId: oldId });
  }

  // Removed emitsSignals per clarification (routines as listeners only)

  /**
   * Destroys the routine.
   */
  public destroy(): void {
    this.tasks.clear();
    this.emit("meta.routine.destroyed", { __id: this.id });
  }
}
