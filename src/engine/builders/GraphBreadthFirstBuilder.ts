import GraphBuilder from "../../interfaces/GraphBuilder";
import GraphNode from "../../graph/execution/GraphNode";

/**
 * A builder class for constructing graphs using a breadth-first approach. Extends the
 * functionality of the `GraphBuilder` class to iterate through graph layers and execute
 * operations on each layer in a breadth-first manner.
 *
 * This class is designed to process a graph layer by layer, executing specific logic
 * on nodes of the current layer and adding newly created or discovered nodes to the graph.
 */
export default class GraphBreadthFirstBuilder extends GraphBuilder {
  /**
   * Composes layers of a graph by iterating through them, executing their logic,
   * and adding the resulting nodes to the current graph.
   *
   * @return {void} This method does not return a value.
   */
  compose() {
    if (!this.graph) {
      return;
    }

    const layers = this.graph.getIterator();
    while (layers.hasNext()) {
      const layer = layers.next();
      const newNodes = layer.execute() as GraphNode[];
      this.addNodes(newNodes);
    }
  }
}
