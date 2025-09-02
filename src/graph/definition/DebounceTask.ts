import Task, { TaskFunction, TaskResult } from "./Task";
import GraphContext from "../context/GraphContext";
import { SchemaDefinition } from "../../types/schema";

export interface DebounceOptions {
  leading?: boolean;
  trailing?: boolean;
  maxWait?: number;
}

export default class DebounceTask extends Task {
  readonly debounceTime: number;
  leading: boolean;
  trailing: boolean;
  maxWait: number;
  timer: NodeJS.Timeout | null = null;
  maxTimer: NodeJS.Timeout | null = null;
  hasLaterCall: boolean = false;
  lastResolve: ((value: unknown) => void) | null = null;
  lastReject: ((reason?: any) => void) | null = null;
  lastContext: GraphContext | null = null;
  lastTimeout: NodeJS.Timeout | null = null;
  lastProgressCallback: ((progress: number) => void) | null = null;
  lastEmitFunction: ((signal: string, context: any) => void) | null = null;

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
    isSubMeta: boolean = false,
    isHidden: boolean = false,
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
      isSubMeta,
      isHidden,
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

  executeFunction(): void {
    if (this.lastTimeout) {
      clearTimeout(this.lastTimeout);
    }

    let result;
    try {
      result = this.taskFunction(
        this.lastContext!.getClonedContext(),
        this.lastEmitFunction!,
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

  debouncedTrigger(
    resolve: (value: unknown) => void,
    reject: (reason?: any) => void,
    context: GraphContext,
    timeout: NodeJS.Timeout,
    emit: (signal: string, context: any) => void,
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
    this.lastEmitFunction = emit;

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
    emit: (signal: string, context: any) => void,
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
        emit,
        progressCallback,
      );
    });
  }
}
