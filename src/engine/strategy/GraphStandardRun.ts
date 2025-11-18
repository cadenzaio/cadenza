import GraphRunStrategy from "../../interfaces/GraphRunStrategy";

/**
 * The GraphStandardRun class extends the GraphRunStrategy and provides
 * a concrete implementation of methods to manage and execute a graph run.
 * This class is responsible for orchestrating the graph composition,
 * updating the run instance, and resetting its state after execution.
 */
export default class GraphStandardRun extends GraphRunStrategy {
  /**
   * Executes the sequence of operations involving graph composition,
   * instance updating, and reset mechanisms.
   *
   * @return {void} Does not return a value.
   */
  run() {
    this.graphBuilder.compose();
    this.updateRunInstance();
    this.reset();
  }

  export(): any {
    return {};
  }
}
