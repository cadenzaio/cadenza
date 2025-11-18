import GraphNode from "./GraphNode";
import GraphLayer from "../../interfaces/GraphLayer";
import ThrottleEngine from "../../engine/ThrottleEngine";

/**
 * Represents an asynchronous layer of graph nodes within a graph execution framework.
 * Extends the functionality of the base `GraphLayer` class to handle asynchronous node processing.
 */
export default class AsyncGraphLayer extends GraphLayer {
  waitingNodes: GraphNode[] = [];
  processingNodes: Set<GraphNode> = new Set();

  constructor(index: number) {
    super(index);
  }

  /**
   * Adds a node to the graph and tracks it as a waiting node.
   *
   * @param {GraphNode} node - The graph node to be added.
   * @return {void}
   */
  add(node: GraphNode) {
    this.nodes.push(node);
    this.waitingNodes.push(node);
  }

  /**
   * Executes the processing of nodes by iterating over the queued `waitingNodes`,
   * processing each node, and managing concurrency limits where applicable.
   * The method returns a mapping of routine execution IDs to arrays of processed nodes or promises.
   *
   * @return {Object} An object where the keys are routine execution IDs and the values
   * represent arrays of processed nodes or promises resolving to processed nodes.
   */
  execute() {
    if (this.waitingNodes.length === 0) {
      return {};
    }

    this.start();

    const result: {
      [routineExecId: string]: (GraphNode[] | Promise<GraphNode[]>)[];
    } = {};

    while (this.waitingNodes.length > 0) {
      const node = this.waitingNodes.shift();
      if (!node) {
        break;
      }

      this.processingNodes.add(node);

      result[node.routineExecId] ??= [];

      let nextNodes;
      if (node?.getConcurrency()) {
        const tag = node.getTag();
        ThrottleEngine.instance.setConcurrencyLimit(tag, node.getConcurrency());
        nextNodes = ThrottleEngine.instance.throttle(
          this.processNode.bind(this),
          node,
          tag,
        );
      } else {
        nextNodes = this.processNode(node);
      }

      result[node.routineExecId].push(nextNodes);
    }

    if (this.processingNodes.size === 0) {
      this.end();
    }

    return result;
  }

  /**
   * Processes the given graph node, executes its logic, and handles synchronous or asynchronous outcomes.
   *
   * @param {GraphNode} node - The graph node to be processed.
   * @return {Promise<GraphNode[]> | GraphNode[]} A promise that resolves to an array of next graph nodes if asynchronous,
   * or an array of next graph nodes if synchronous.
   */
  processNode(node: GraphNode): Promise<GraphNode[]> | GraphNode[] {
    node.start();

    const nextNodes = node.execute();

    if (nextNodes instanceof Promise) {
      return this.processAsync(node, nextNodes);
    }

    this.processingNodes.delete(node);

    return nextNodes;
  }

  /**
   * Processes the given graph node asynchronously and removes it from the processing nodes set.
   *
   * @param {GraphNode} node - The current graph node being processed.
   * @param {Promise<GraphNode[]>} nextNodes - A promise that resolves to an array of the next graph nodes to process.
   * @return {Promise<GraphNode[]>} A promise that resolves to an array of the next graph nodes.
   */
  async processAsync(node: GraphNode, nextNodes: Promise<GraphNode[]>) {
    const result = await nextNodes;
    this.processingNodes.delete(node);
    return result;
  }

  /**
   * Cleans up resources used by the instance by resetting relevant properties and invoking the parent class's destroy method.
   *
   * @return {void} No value is returned as the method performs cleanup operations.
   */
  destroy() {
    super.destroy();
    this.waitingNodes = [];
    this.processingNodes = new Set();
  }
}
