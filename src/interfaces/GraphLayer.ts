import ExecutionChain from "./ExecutionChain";
import Graph from "./Graph";
import GraphNode from "../graph/execution/GraphNode";
import GraphLayerIterator from "../graph/iterators/GraphLayerIterator";
import GraphVisitor from "./GraphVisitor";
import GraphContext from "../graph/context/GraphContext";

export default abstract class GraphLayer
  extends ExecutionChain
  implements Graph
{
  readonly index: number;
  nodes: GraphNode[] = [];
  executionTime: number = 0;
  executionStart: number = 0;
  debug: boolean = false;

  constructor(index: number) {
    super();
    this.index = index;
  }

  setDebug(value: boolean) {
    this.debug = value;
    for (const node of this.nodes) {
      node.setDebug(value);
    }
  }

  abstract execute(context?: GraphContext): unknown;

  get hasPreceding() {
    return !!this.previous && this.previous instanceof GraphLayer;
  }

  getNumberOfNodes() {
    return this.nodes.length;
  }

  getNodesByRoutineExecId(routineExecId: string) {
    return this.nodes.filter((node) => node.routineExecId === routineExecId);
  }

  getIdenticalNodes(node: GraphNode) {
    return this.nodes.filter(
      (n) => node.routineExecId === n.routineExecId && node.sharesTaskWith(n),
    );
  }

  isProcessed() {
    for (const node of this.nodes) {
      if (!node.isProcessed()) {
        return false;
      }
    }

    return true;
  }

  graphDone() {
    let done = true;

    let layer: GraphLayer | undefined = this;
    while (layer) {
      if (!layer.isProcessed()) {
        done = false;
        break;
      }
      layer = layer.getNext() as GraphLayer;
    }

    return done;
  }

  setNext(next: GraphLayer) {
    if (next.index <= this.index) {
      return;
    }

    if (next.previous !== undefined) {
      this.previous = next.previous;
    }

    super.setNext(next);
  }

  add(node: GraphNode) {
    this.nodes.push(node);
  }

  start() {
    if (!this.executionStart) {
      this.executionStart = Date.now();
    }
    return this.executionStart;
  }

  end() {
    if (!this.executionStart) {
      return 0;
    }

    const end = Date.now();
    this.executionTime = end - this.executionStart;
    return end;
  }

  destroy() {
    for (const node of this.nodes) {
      node.destroy();
    }

    this.nodes = [];

    if (this.hasNext) {
      const layer = this.getNext() as GraphLayer;
      layer?.destroy();
    }

    this.decouple();
  }

  getIterator(): GraphLayerIterator {
    return new GraphLayerIterator(this);
  }

  accept(visitor: GraphVisitor) {
    visitor.visitLayer(this);

    for (const node of this.nodes) {
      node.accept(visitor);
    }
  }

  export() {
    return {
      __index: this.index,
      __executionTime: this.executionTime,
      __numberOfNodes: this.getNumberOfNodes(),
      __hasNextLayer: this.hasNext,
      __hasPrecedingLayer: this.hasPreceding,
      __nodes: this.nodes.map((node) => node.id),
    };
  }

  log() {
    console.log(`---Layer ${this.index}---`);
    console.log("Execution time:", this.executionTime);
    let prevNode;
    for (const node of this.nodes) {
      if (!prevNode || !prevNode.sharesContextWith(node)) {
        console.log("**********");
      }
      node.log();
      prevNode = node;
    }
    console.log("***********");
    if (this.hasNext) {
      (this.getNext() as GraphLayer).log();
    }
  }
}
