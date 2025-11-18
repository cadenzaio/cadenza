import GraphNode from "./GraphNode";
import GraphLayer from "../../interfaces/GraphLayer";

/**
 * Represents a synchronous graph layer derived from the GraphLayer base class.
 * This class is designed to execute graph nodes in a strictly synchronous manner.
 * Asynchronous functions are explicitly disallowed, ensuring consistency and predictability.
 */
export default class SyncGraphLayer extends GraphLayer {
  /**
   * Executes the processing logic of the current set of graph nodes. Iterates through all
   * nodes, skipping any that have already been processed, and executes their respective
   * logic to generate new nodes. Asynchronous functions are not supported and will
   * trigger an error log.
   *
   * @return {GraphNode[]} An array of newly generated graph nodes after executing the logic of each unprocessed node.
   */
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
