import ExecutionChain from "./ExecutionChain";
import Graph from "./Graph";
import GraphNode from "../graph/execution/GraphNode";
import GraphLayerIterator from "../graph/iterators/GraphLayerIterator";
import GraphVisitor from "./GraphVisitor";
import GraphContext from "../graph/context/GraphContext";

/**
 * Represents an abstract layer in a graph, handling nodes and their execution.
 * A `GraphLayer` can manage execution states, debug states, and relationships with other layers in the graph.
 * This class is designed to be extended and requires the implementation of the `execute` method.
 *
 * @abstract
 * @class GraphLayer
 * @extends ExecutionChain
 * @implements Graph
 */
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

  /**
   * Sets the debug mode for the current instance and all associated nodes.
   *
   * @param {boolean} value - A boolean value to enable (true) or disable (false) debug mode.
   * @return {void} No return value.
   */
  setDebug(value: boolean) {
    this.debug = value;
    for (const node of this.nodes) {
      node.setDebug(value);
    }
  }

  /**
   * Abstract method to execute a specific operation given a context.
   *
   * @param {GraphContext} [context] - Optional parameter representing the execution context, which contains relevant data for performing the operation.
   * @return {unknown} - Returns the result of the operation, its type may vary depending on the implementation.
   */
  abstract execute(context?: GraphContext): unknown;

  /**
   * Checks if the current layer has a preceding layer.
   *
   * @return {boolean} True if the current layer has a preceding layer that is an instance of GraphLayer; otherwise, false.
   */
  get hasPreceding() {
    return !!this.previous && this.previous instanceof GraphLayer;
  }

  getNumberOfNodes() {
    return this.nodes.length;
  }

  /**
   * Retrieves a list of nodes that match the given routine execution ID.
   *
   * @param {string} routineExecId - The ID of the routine execution to filter nodes by.
   * @return {Array} An array of nodes that have the specified routine execution ID.
   */
  getNodesByRoutineExecId(routineExecId: string) {
    return this.nodes.filter((node) => node.routineExecId === routineExecId);
  }

  /**
   * Finds and returns all nodes in the graph that are identical to the given node.
   * Two nodes are considered identical if they share the same routine execution ID
   * and share a task with each other.
   *
   * @param {GraphNode} node - The reference node to compare against other nodes in the graph.
   * @return {GraphNode[]} An array of nodes that are identical to the given node.
   */
  getIdenticalNodes(node: GraphNode) {
    return this.nodes.filter(
      (n) => node.routineExecId === n.routineExecId && node.sharesTaskWith(n),
    );
  }

  /**
   * Checks whether all nodes in the collection have been processed.
   *
   * @return {boolean} Returns true if all nodes are processed, otherwise false.
   */
  isProcessed() {
    for (const node of this.nodes) {
      if (!node.isProcessed()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Checks whether all layers in the graph have been processed.
   *
   * @return {boolean} Returns true if all graph layers are processed; otherwise, returns false.
   */
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

  /**
   * Sets the next GraphLayer in the sequence if it has a higher index than the current layer.
   * Updates the previous property if the given next layer has an existing previous layer.
   *
   * @param {GraphLayer} next - The next GraphLayer to be linked in the sequence.
   * @return {void} Does not return a value. Modifies the current layer's state.
   */
  setNext(next: GraphLayer) {
    if (next.index <= this.index) {
      return;
    }

    if (next.previous !== undefined) {
      this.previous = next.previous;
    }

    super.setNext(next);
  }

  /**
   * Adds a node to the graph.
   *
   * @param {GraphNode} node - The node to be added to the graph.
   * @return {void}
   */
  add(node: GraphNode) {
    this.nodes.push(node);
  }

  /**
   * Starts the execution timer if it has not been started already.
   * Records the current timestamp as the start time.
   *
   * @return {number} The timestamp representing the start time in milliseconds.
   */
  start() {
    if (!this.executionStart) {
      this.executionStart = Date.now();
    }
    return this.executionStart;
  }

  /**
   * Marks the end of a process by capturing the current timestamp and calculating the execution time if a start time exists.
   *
   * @return {number} The timestamp at which the process ended, or 0 if the start time is not defined.
   */
  end() {
    if (!this.executionStart) {
      return 0;
    }

    const end = Date.now();
    this.executionTime = end - this.executionStart;
    return end;
  }

  /**
   * Destroys the current graph layer and its associated resources.
   * This method recursively destroys all nodes in the current layer, clears the node list,
   * and ensures that any connected subsequent graph layers are also destroyed.
   * Additionally, it calls the decoupling logic to disconnect the current layer from its dependencies.
   *
   * @return {void} Does not return any value.
   */
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

  /**
   * Returns an iterator for traversing through the graph layers.
   *
   * @return {GraphLayerIterator} An instance of GraphLayerIterator to traverse graph layers.
   */
  getIterator(): GraphLayerIterator {
    return new GraphLayerIterator(this);
  }

  /**
   * Accepts a visitor object to traverse or perform operations on the current graph layer and its nodes.
   *
   * @param {GraphVisitor} visitor - The visitor instance implementing the visitLayer and visitNode behavior.
   * @return {void} Returns nothing.
   */
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
