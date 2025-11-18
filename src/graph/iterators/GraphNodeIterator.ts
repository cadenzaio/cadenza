import Iterator from "../../interfaces/Iterator";
import GraphNode from "../execution/GraphNode";

/**
 * Represents an iterator for traversing nodes in a graph structure.
 * Implements the Iterator interface and allows traversal of nodes layer by layer.
 */
export default class GraphNodeIterator implements Iterator {
  currentNode: GraphNode | undefined;
  currentLayer: GraphNode[] = [];
  nextLayer: GraphNode[] = [];
  index: number = 0;

  constructor(node: GraphNode) {
    this.currentNode = node;
    this.currentLayer = [node];
  }

  hasNext(): boolean {
    return !!this.currentNode;
  }

  next(): any {
    const nextNode = this.currentNode;

    if (!nextNode) {
      return undefined;
    }

    this.nextLayer.push(...nextNode.mapNext((n: GraphNode) => n));

    this.index++;

    if (this.index === this.currentLayer.length) {
      this.currentLayer = this.nextLayer;
      this.nextLayer = [];
      this.index = 0;
    }

    this.currentNode = this.currentLayer.length
      ? this.currentLayer[this.index]
      : undefined;

    return nextNode;
  }
}
