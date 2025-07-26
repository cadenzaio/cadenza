import GraphBuilder from "../../interfaces/GraphBuilder";
import { sleep } from "../../../utils/promise";
import AsyncGraphLayer from "../../graph/execution/AsyncGraphLayer";
import GraphNode from "../../graph/execution/GraphNode";

export default class GraphAsyncQueueBuilder extends GraphBuilder {
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

  private processLayer(layer: AsyncGraphLayer) {
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

  protected createLayer(index: number) {
    return new AsyncGraphLayer(index);
  }
}
