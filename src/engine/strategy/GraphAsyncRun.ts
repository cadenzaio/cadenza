import GraphRunStrategy from "../../interfaces/GraphRunStrategy";
import GraphAsyncQueueBuilder from "../builders/GraphAsyncQueueBuilder";

/**
 * The GraphAsyncRun class extends GraphRunStrategy to implement an asynchronous
 * graph execution strategy. It utilizes a GraphAsyncQueueBuilder for building
 * and composing the graph asynchronously before execution.
 */
export default class GraphAsyncRun extends GraphRunStrategy {
  constructor() {
    super();
    this.graphBuilder = new GraphAsyncQueueBuilder();
  }

  /**
   * Executes the run operation, which involves composing the graph builder,
   * updating the run instance, and resetting the state.
   *
   * @return {Promise<void>} A promise that resolves when the operation completes.
   */
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
