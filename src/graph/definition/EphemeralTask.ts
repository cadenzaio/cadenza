import Task, { TaskFunction } from "./Task";

export default class EphemeralTask extends Task {
  private readonly once: boolean;
  private readonly condition: (context: any) => boolean;
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
  ) {
    super(name, task, description, concurrency, timeout, register);
    this.once = once;
    this.condition = condition;
  }

  public execute(context: any, progressCallback: (progress: number) => void) {
    const result = super.execute(context, progressCallback);

    this.emit("meta.ephemeral.executed", result);

    if (this.once || !this.condition(result)) {
      this.destroy();
      return result;
    }
  }
}
