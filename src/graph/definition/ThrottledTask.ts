import Task, { TaskFunction } from "./Task";
import { AnyObject } from "../../types/global";

export type ThrottleTagGetter = (context?: AnyObject, task?: Task) => string;

export default class ThrottledTask extends Task {
  readonly throttled: boolean = true;

  constructor(
    name: string,
    task: TaskFunction,
    description: string = "",
    getTagCallback: ThrottleTagGetter = (context?: AnyObject, task?: Task) =>
      "default",
    concurrency: number = 1,
    timeout: number = 0,
    register: boolean = true,
    isUnique: boolean = false,
    isMeta: boolean = false,
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
    );
    this.getTag = (context?: AnyObject) => getTagCallback(context, this);
  }
}
