import Task, { TaskFunction, TaskResult } from "./Task";
import GraphContext from "../context/GraphContext";
import { SchemaDefinition } from "../../types/schema";

export interface DebounceOptions {
  leading?: boolean;
  trailing?: boolean;
  maxWait?: number;
}

export default class DebounceTask extends Task {
  private readonly debounceTime: number;
  private leading: boolean;
  private trailing: boolean;
  private maxWait: number;
  private timer: NodeJS.Timeout | null = null;
  private maxTimer: NodeJS.Timeout | null = null;
  private hasLaterCall: boolean = false;
  private lastResolve: ((value: unknown) => void) | null = null;
  private lastReject: ((reason?: any) => void) | null = null;
  private lastContext: GraphContext | null = null;
  private lastTimeout: NodeJS.Timeout | null = null;
  private lastProgressCallback: ((progress: number) => void) | null = null;

  constructor(
    name: string,
    task: TaskFunction,
    description: string = "",
    debounceTime: number = 1000,
    leading: boolean = false,
    trailing: boolean = true,
    maxWait: number = 0,
    concurrency: number = 0,
    timeout: number = 0,
    register: boolean = true,
    isUnique: boolean = false,
    isMeta: boolean = false,
    inputSchema: SchemaDefinition | undefined = undefined,
    validateInputSchema: boolean = false,
    outputSchema: SchemaDefinition | undefined = undefined,
    validateOutputSchema: boolean = false,
  ) {
    super(
      name,
      task,
      description,
      concurrency,
      timeout,
      register,
      isUnique,
      isMeta,
      undefined,
      inputSchema,
      validateInputSchema,
      outputSchema,
      validateOutputSchema,
    );
    this.debounceTime = debounceTime;
    this.leading = leading;
    this.trailing = trailing;
    this.maxWait = maxWait;
  }

  private executeFunction(): void {
    if (this.lastTimeout) {
      clearTimeout(this.lastTimeout);
    }

    let result;
    try {
      result = this.taskFunction(
        this.lastContext!.getClonedContext(),
        this.lastProgressCallback!,
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
    const isNewBurst = this.timer === null;

    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.lastResolve = resolve;
    this.lastReject = reject;
    this.lastContext = context;
    this.lastTimeout = timeout;
    this.lastProgressCallback = progressCallback;

    if (!callNow) {
      this.hasLaterCall = true;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.trailing && this.hasLaterCall) {
        this.executeFunction();
        this.hasLaterCall = false;
      }
      if (this.maxTimer) {
        clearTimeout(this.maxTimer);
        this.maxTimer = null;
      }
    }, this.debounceTime);

    if (callNow) {
      this.executeFunction();
      this.hasLaterCall = false;
    }

    if (this.maxWait > 0 && isNewBurst) {
      this.maxTimer = setTimeout(() => {
        this.maxTimer = null;
        if (this.trailing && this.hasLaterCall) {
          if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
          }
          this.executeFunction();
          this.hasLaterCall = false;
        }
      }, this.maxWait);
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
