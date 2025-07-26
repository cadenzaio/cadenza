import Task, { TaskFunction, TaskResult } from "./Task";
import GraphContext from "../context/GraphContext";

export interface DebounceOptions {
  leading?: boolean;
  trailing?: boolean;
}

export default class DebounceTask extends Task {
  private readonly debounceTime: number;
  private leading: boolean;
  private trailing: boolean;
  private timer: NodeJS.Timeout | null = null;
  private lastResolve: ((value: unknown) => void) | null = null;
  private lastReject: ((reason?: any) => void) | null = null;
  private lastContext: GraphContext | null = null;
  private lastTimeout: NodeJS.Timeout | null = null;

  constructor(
    name: string,
    task: TaskFunction,
    description: string = "",
    debounceTime: number = 1000,
    leading: boolean = false,
    trailing: boolean = true,
    concurrency: number = 0,
    timeout: number = 0,
    register: boolean = true,
  ) {
    super(name, task, description, concurrency, timeout, register);
    this.debounceTime = debounceTime;
    this.leading = leading;
    this.trailing = trailing;
  }

  private executeFunction(progressCallback: (progress: number) => void): void {
    if (this.lastTimeout) {
      clearTimeout(this.lastTimeout);
    }

    let result;
    try {
      result = this.taskFunction(
        this.lastContext!.getClonedContext(),
        progressCallback,
      );
    } catch (error) {
      if (this.lastResolve) {
        this.lastResolve(error);
      }
      return;
    }

    if (result instanceof Promise) {
      result.then(this.lastResolve!).catch(this.lastReject!);
    } else {
      if (this.lastResolve) {
        this.lastResolve(result);
      }
    }
  }

  private debouncedTrigger(
    resolve: (value: unknown) => void,
    reject: (reason?: any) => void,
    context: GraphContext,
    timeout: NodeJS.Timeout,
    progressCallback: (progress: number) => void,
  ): void {
    const callNow = this.leading && this.timer === null;

    if (this.timer !== null) {
      clearTimeout(this.timer);
    }

    this.lastResolve = resolve;
    this.lastReject = reject;
    this.lastContext = context;
    this.lastTimeout = timeout;

    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.trailing) {
        this.executeFunction(progressCallback);
      }
    }, this.debounceTime);

    if (callNow) {
      this.executeFunction(progressCallback);
    }
  }

  execute(
    context: GraphContext,
    progressCallback: (progress: number) => void,
  ): TaskResult {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, this.debounceTime + 1);

      this.debouncedTrigger(
        resolve,
        reject,
        context,
        timeout,
        progressCallback,
      );
    });
  }
}
