import GraphNode from "./GraphNode";
import GraphLayer from "../../interfaces/GraphLayer";
import ThrottleEngine from "../../engine/ThrottleEngine";

export default class AsyncGraphLayer extends GraphLayer {
  waitingNodes: GraphNode[] = [];
  processingNodes: Set<GraphNode> = new Set();

  constructor(index: number) {
    super(index);
  }

  add(node: GraphNode) {
    this.nodes.push(node);
    this.waitingNodes.push(node);
  }

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

  processNode(node: GraphNode): Promise<GraphNode[]> | GraphNode[] {
    node.start();

    const nextNodes = node.execute();

    if (nextNodes instanceof Promise) {
      return this.processAsync(node, nextNodes);
    }

    this.processingNodes.delete(node);

    return nextNodes;
  }

  async processAsync(node: GraphNode, nextNodes: Promise<GraphNode[]>) {
    const result = await nextNodes;
    this.processingNodes.delete(node);
    return result;
  }

  destroy() {
    super.destroy();
    this.waitingNodes = [];
    this.processingNodes = new Set();
  }
}
