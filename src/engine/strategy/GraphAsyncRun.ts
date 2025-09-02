import GraphRunStrategy from "../../interfaces/GraphRunStrategy";
import GraphAsyncQueueBuilder from "../builders/GraphAsyncQueueBuilder";

export default class GraphAsyncRun extends GraphRunStrategy {
  constructor() {
    super();
    this.graphBuilder = new GraphAsyncQueueBuilder();
  }

  async run() {
    await this.graphBuilder.compose();
    this.updateRunInstance();
    this.reset();
  }

  reset() {
    super.reset();
  }

  export(): any {
    return {};
  }
}
