import Task from "./Task";

export default class SignalTask extends Task {
  constructor(signal: string, description: string = "") {
    super(signal, () => true, description);

    this.signalsToEmitAfter.add(signal);
  }
}
