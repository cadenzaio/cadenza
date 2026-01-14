import Task, { TaskFunction, ThrottleTagGetter } from "./Task";
import { SchemaDefinition } from "../../types/schema";
import { AnyObject } from "../../types/global";
import { InquiryOptions } from "../../engine/InquiryBroker";

export type EphemeralTaskOptions = {
  once?: boolean;
  destroyCondition?: (context: any) => boolean;
};

/**
 * Represents a transient task that executes and may optionally self-destruct
 * based on given conditions.
 *
 * EphemeralTask extends the standard Task class and introduces additional
 * features for managing tasks that are intended to run only once, or under
 * certain conditions. This class is particularly useful when you want a task
 * to clean up after itself and not persist within the system indefinitely.
 */
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

  /**
   * Executes the process logic with the provided context, emit function, progress callback, and node data.
   *
   * @param {any} context - The execution context, carrying necessary parameters or states for the operation.
   * @param {function(string, AnyObject): void} emit - A function to emit signals with a string identifier and associated context.
   * @param inquire
   * @param {function(number): void} progressCallback - A callback function to report the progress of the execution as a numerical value.
   * @param {{ nodeId: string, routineExecId: string }} nodeData - An object containing details about the node ID and routine execution ID.
   * @return {any} The result of the execution, returned from the base implementation or processed internally.
   */
  public execute(
    context: any,
    emit: (signal: string, context: AnyObject) => void,
    inquire: (
      inquiry: string,
      context: AnyObject,
      options: InquiryOptions,
    ) => Promise<AnyObject>,
    progressCallback: (progress: number) => void,
    nodeData: { nodeId: string; routineExecId: string },
  ) {
    const result = super.execute(
      context,
      emit,
      inquire,
      progressCallback,
      nodeData,
    );

    if (this.once || this.condition(result)) {
      this.destroy();
    }

    return result;
  }
}
