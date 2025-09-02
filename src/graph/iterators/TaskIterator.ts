import Iterator from "../../interfaces/Iterator";
import Task from "../definition/Task";

export default class TaskIterator implements Iterator {
  currentTask: Task | undefined;
  currentLayer: Set<Task> = new Set();
  nextLayer: Set<Task> = new Set();
  iterator: { next: () => { value: Task | undefined } } =
    this.currentLayer[Symbol.iterator]();

  constructor(task: Task) {
    this.currentTask = task;
    this.currentLayer.add(task);
  }
  hasNext(): boolean {
    return !!this.currentTask;
  }

  next(): Task | undefined {
    const nextTask = this.currentTask;

    if (!nextTask) {
      return undefined;
    }

    nextTask.mapNext((t: Task) => this.nextLayer.add(t));

    let next = this.iterator.next();

    if (next.value === undefined) {
      this.currentLayer.clear();
      this.currentLayer = this.nextLayer;
      this.nextLayer = new Set();
      this.iterator = this.currentLayer[Symbol.iterator]();
      next = this.iterator.next();
    }

    this.currentTask = next.value;

    return nextTask;
  }
}
