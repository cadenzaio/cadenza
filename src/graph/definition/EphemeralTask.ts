import Task, { TaskFunction, ThrottleTagGetter } from "./Task";
import { SchemaDefinition } from "../../types/schema";
import { AnyObject } from "../../types/global";

export type EphemeralTaskOptions = {
  once?: boolean;
  destroyCondition?: (context: any) => boolean;
};

export default class EphemeralTask extends Task {
  readonly once: boolean;
  readonly condition: (context: any) => boolean;
  readonly isEphemeral: boolean = true;

  constructor(
    name: string,
    task: TaskFunction,
    description: string = "",
    once: boolean = true,
    condition: (context: any) => boolean = () => true,
    concurrency: number = 0,
    timeout: number = 0,
    register: boolean = false,
    isUnique: boolean = false,
    isMeta: boolean = false,
    isSubMeta: boolean = false,
    isHidden: boolean = false,
    getTagCallback: ThrottleTagGetter | undefined = undefined,
    inputSchema: SchemaDefinition | undefined = undefined,
    validateInputContext: boolean = false,
    outputSchema: SchemaDefinition | undefined = undefined,
    validateOutputContext: boolean = false,
    retryCount: number = 0,
    retryDelay: number = 0,
    retryDelayMax: number = 0,
    retryDelayFactor: number = 1,
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
      getTagCallback,
      inputSchema,
      validateInputContext,
      outputSchema,
      validateOutputContext,
      retryCount,
      retryDelay,
      retryDelayMax,
      retryDelayFactor,
    );
    this.once = once;
    this.condition = condition;
  }

  public execute(
    context: any,
    emit: (signal: string, context: AnyObject) => void,
    progressCallback: (progress: number) => void,
  ) {
    const result = super.execute(context, emit, progressCallback);

    if (this.once || this.condition(result)) {
      this.destroy();
    }

    return result;
  }
}
