import GraphBuilder from "../../interfaces/GraphBuilder";
import GraphNode from "../../graph/execution/GraphNode";

export default class GraphBreadthFirstBuilder extends GraphBuilder {
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
