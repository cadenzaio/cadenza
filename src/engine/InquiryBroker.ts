import { SchemaDefinition } from "../types/schema";
import GraphRunner from "./GraphRunner";
import Task from "../graph/definition/Task";
import GraphRoutine from "../graph/definition/GraphRoutine";
import { AnyObject } from "../types/global";
import SignalEmitter from "../interfaces/SignalEmitter";
import Cadenza from "../Cadenza";
import { v4 as uuid } from "uuid";

export interface Intent {
  name: string;
  description?: string;
  input?: SchemaDefinition;
  output?: SchemaDefinition;
}

export interface InquiryOptions {
  timeout?: number;
  rejectOnTimeout?: boolean;
  includePendingTasks?: boolean;
}

export default class InquiryBroker extends SignalEmitter {
  static instance_: InquiryBroker;

  static get instance(): InquiryBroker {
    if (!this.instance_) {
      this.instance_ = new InquiryBroker();
    }
    return this.instance_;
  }

  debug: boolean = false;
  verbose: boolean = false;

  setDebug(value: boolean) {
    this.debug = value;
  }

  setVerbose(value: boolean) {
    this.verbose = value;
  }

  validateInquiryName(inquiryName: string): void {
    if (inquiryName.length > 100) {
      throw new Error(
        `Inquiry name must be less than 100 characters: ${inquiryName}`,
      );
    }

    if (inquiryName.includes(" ")) {
      throw new Error(`Inquiry name must not contain spaces: ${inquiryName}"`);
    }

    if (inquiryName.includes("\\")) {
      throw new Error(
        `Inquiry name must not contain backslashes: ${inquiryName}`,
      );
    }

    if (inquiryName.includes(".")) {
      throw new Error(`Inquiry name must not contain dots: ${inquiryName}`);
    }
  }

  runner: GraphRunner | undefined;
  metaRunner: GraphRunner | undefined;

  inquiryObservers: Map<
    string,
    {
      fn: (runner: GraphRunner, tasks: Task[], context: AnyObject) => void;
      tasks: Set<Task>;
      registered: boolean;
    }
  > = new Map();

  intents: Map<string, Intent> = new Map();

  /**
   * Initializes with runners.
   * @param runner Standard runner for user signals.
   * @param metaRunner Meta runner for 'meta.' signals (suppresses further meta-emits).
   */
  bootstrap(runner: GraphRunner, metaRunner: GraphRunner): void {
    this.runner = runner;
    this.metaRunner = metaRunner;
  }

  init() {}

  /**
   * Observes an inquiry with a routine/task.
   * @param inquiry The inquiry (e.g., 'domain.action', 'domain.*' for wildcards).
   * @param task The observer.
   * @edge Duplicates ignored; supports wildcards for broad listening.
   */
  observe(inquiry: string, task: Task): void {
    this.addInquiry(inquiry);
    this.inquiryObservers.get(inquiry)!.tasks.add(task);
  }

  /**
   * Unsubscribes a routine/task from an inquiry.
   * @param inquiry The inquiry.
   * @param task The observer.
   * @edge Removes all instances if duplicate; deletes if empty.
   */
  unsubscribe(inquiry: string, task: Task): void {
    const obs = this.inquiryObservers.get(inquiry);
    if (obs) {
      obs.tasks.delete(task);
      if (obs.tasks.size === 0) {
        this.inquiryObservers.delete(inquiry);
      }
    }
  }

  addInquiry(inquiry: string): void {
    if (!this.inquiryObservers.has(inquiry)) {
      this.validateInquiryName(inquiry);
      this.inquiryObservers.set(inquiry, {
        fn: (
          runner: GraphRunner,
          tasks: (Task | GraphRoutine)[],
          context: AnyObject,
        ) => runner.run(tasks, context),
        tasks: new Set(),
        registered: false,
      });

      if (!this.intents.has(inquiry)) {
        this.addIntent({
          name: inquiry,
          description: "",
          input: { type: "object" },
          output: { type: "object" },
        });
      }
    }
  }

  addIntent(intent: Intent) {
    if (!this.intents.has(intent.name)) {
      this.validateInquiryName(intent.name);
      this.intents.set(intent.name, intent);
      this.emit("meta.inquiry_broker.added", { data: { ...intent } });
    } else {
      const currentIntent = this.intents.get(intent.name)!;
      if (currentIntent.description !== intent.description) {
        currentIntent.description = intent.description;
      }
      if (intent.input && currentIntent.input !== intent.input) {
        // TODO: deep compare
        currentIntent.input = intent.input;
      }
      if (intent.output && currentIntent.output !== intent.output) {
        // TODO: deep compare
        currentIntent.output = intent.output;
      }

      if (this.inquiryObservers.has(intent.name)) {
        for (const task of this.inquiryObservers.get(intent.name)!.tasks) {
          task.respondsTo(intent.name);
        }
      }
    }
  }

  inquire(
    inquiry: string,
    context: AnyObject,
    options: InquiryOptions = {},
  ): Promise<AnyObject> {
    const tasks = this.inquiryObservers.get(inquiry)?.tasks;
    if (!tasks || tasks.size === 0) {
      return Promise.resolve({});
    }

    return new Promise((resolve, reject) => {
      this.emit("meta.inquiry_broker.inquire", {});
      let joinedContext: any = {};
      const taskCount = tasks.size;
      const pendingTaskNamesByInquiryId = new Map<string, string>();
      const timeoutMs = Number(options.timeout ?? 0);
      const normalizedTimeoutMs =
        Number.isFinite(timeoutMs) && timeoutMs > 0
          ? Math.trunc(timeoutMs)
          : 0;
      const rejectOnTimeout = options.rejectOnTimeout === true;
      const includePendingTasks = options.includePendingTasks !== false;

      const resolveTasks: Task[] = [];
      let timeoutId: NodeJS.Timeout | undefined;
      let settled = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }

        for (const resolveTask of resolveTasks) {
          resolveTask.destroy();
        }
      };

      const finalize = (resultContext: AnyObject, isTimeout = false) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();

        if (isTimeout && rejectOnTimeout) {
          reject(resultContext);
          return;
        }

        resolve(resultContext);
      };

      if (normalizedTimeoutMs > 0) {
        timeoutId = setTimeout(() => {
          const pendingTasks = Array.from(pendingTaskNamesByInquiryId.values());
          const timeoutContext: AnyObject = {
            ...joinedContext,
            __error: "Inquire timeout",
            errored: true,
            timedOut: true,
            __inquiryMeta: {
              inquiry,
              timedOut: true,
              timeout: normalizedTimeoutMs,
              totalTasks: taskCount,
              completedTasks: taskCount - pendingTasks.length,
              pendingTasks,
            },
          };

          if (includePendingTasks) {
            timeoutContext.pendingTasks = pendingTasks;
          }

          finalize(timeoutContext, true);
        }, normalizedTimeoutMs);
      }

      for (const task of tasks) {
        const inquiryId = uuid();
        pendingTaskNamesByInquiryId.set(inquiryId, task.name);
        resolveTasks.push(
          Cadenza.createEphemeralMetaTask(
            `Resolve inquiry for ${inquiry}`,
            (ctx) => {
              if (settled) {
                return;
              }

              joinedContext = { ...joinedContext, ...ctx };
              pendingTaskNamesByInquiryId.delete(inquiryId);
              if (pendingTaskNamesByInquiryId.size === 0) {
                finalize(joinedContext);
              }
            },
            "",
            {
              once: true,
              register: false,
            },
          ).doOn(`meta.node.graph_completed:${inquiryId}`),
        );

        if (task.isMeta) {
          this.metaRunner?.run(task, {
            ...context,
            __routineExecId: inquiryId,
            __isInquiry: true,
          });
        } else {
          this.runner?.run(task, {
            ...context,
            __routineExecId: inquiryId,
            __isInquiry: true,
          });
        }
      }
    });
  }

  reset() {
    this.inquiryObservers.clear();
    this.intents.clear();
  }
}
