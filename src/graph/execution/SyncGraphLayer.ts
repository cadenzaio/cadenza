import GraphNode from "./GraphNode";
import GraphLayer from "../../interfaces/GraphLayer";

export default class SyncGraphLayer extends GraphLayer {
  execute(): GraphNode[] {
    this.start();

    const result: GraphNode[] = [];
    for (const node of this.nodes) {
      if (node.isProcessed()) {
        continue;
      }

      const newNodes = node.execute();

      if (newNodes instanceof Promise) {
        console.error("Asynchronous functions are not allowed in sync mode!");
        continue;
      }

      result.push(...(newNodes as GraphNode[]));
    }

    this.end();

    return result;
  }
}
