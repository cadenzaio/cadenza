import GraphBuilder from "../../interfaces/GraphBuilder";
import { sleep } from "../../utils/promise";
import AsyncGraphLayer from "../../graph/execution/AsyncGraphLayer";
import GraphNode from "../../graph/execution/GraphNode";

/**
 * The GraphAsyncQueueBuilder class extends the GraphBuilder class and provides functionality
 * for processing a directed acyclic graph (DAG) asynchronously layer by layer. This class
 * is designed to handle asynchronous execution of graph nodes and manage processing for
 * each layer in an iterative manner.
 *
 * The primary responsibility of this class is to compose the graph by processing its layers,
 * executing asynchronous operations (if any), and managing the dependencies between nodes.
 */
export default class GraphAsyncQueueBuilder extends GraphBuilder {
  /**
   * This method iterates over a graph structure and processes its layers sequentially.
   * It continues processing each layer until all layers in the graph are completed.
   * The asynchronous behavior ensures the operation provides breathing room for other
   * tasks/processes to execute during its operation.
   *
   * @return {Promise<void>} A promise that resolves when all layers of the graph are processed or rejects if an error occurs.
   */
  async compose() {
    if (!this.graph) {
      return;
    }

    const layers = this.graph.getIterator();

    while (true) {
      let layer = layers.getFirst();
      if (layer.graphDone()) {
        return;
      }

      this.processLayer(layer as AsyncGraphLayer);

      while (layers.hasNext()) {
        layer = layers.next();
        this.processLayer(layer as AsyncGraphLayer);
      }

      await sleep(0); // Take a breath
    }
  }

  /**
   * Processes a given asynchronous graph layer and executes its nodes.
   * Handles promises within the nodes and adds the resolved or processed
   * nodes to the graph.
   *
   * @param {AsyncGraphLayer} layer - The asynchronous graph layer to be processed.
   * @return {void} - This method does not return a value.
   */
  processLayer(layer: AsyncGraphLayer) {
    const nextNodes = layer.execute();
    for (const routineExecId of Object.keys(nextNodes)) {
      const group = nextNodes[routineExecId];
      if (group.some((nodes) => nodes instanceof Promise)) {
        Promise.all(group).then((result) =>
          this.addNodes(result.flat() as GraphNode[]),
        );
      } else {
        this.addNodes(group.flat() as GraphNode[]);
      }
    }
  }

  /**
   * Creates a new instance of AsyncGraphLayer, sets its debug configuration,
   * and returns the created layer.
   *
   * @param {number} index - The index to associate with the new AsyncGraphLayer.
   * @return {AsyncGraphLayer} A new instance of AsyncGraphLayer with the specified index and debug configuration.
   */
  createLayer(index: number) {
    const layer = new AsyncGraphLayer(index);
    layer.setDebug(this.debug);
    return layer;
  }
}
