import SyncGraphLayer from "../graph/execution/SyncGraphLayer";
import GraphNode from "../graph/execution/GraphNode";
import GraphLayer from "./GraphLayer";

/**
 * GraphBuilder is an abstract base class designed to construct and manage a graph structure
 * composed of multiple layers. Subclasses are expected to implement the `compose` method
 * based on specific requirements. This class provides methods for adding nodes, managing
 * layers, and resetting the graph construction process.
 *
 * This class supports creating layered graph structures, dynamically adding layers and nodes,
 * and debugging graph-building operations.
 */
export default abstract class GraphBuilder {
  graph: GraphLayer | undefined;
  topLayerIndex: number = 0;
  layers: GraphLayer[] = [];
  debug: boolean = false;

  setDebug(value: boolean) {
    this.debug = value;
  }

  getResult(): GraphLayer {
    return this.graph as GraphLayer;
  }

  /**
   * Composes a series of functions or operations.
   * This method should be implemented in the child class
   * to define custom composition logic.
   *
   * @return {any} The result of the composed operations or functions
   * when implemented in the child class.
   */
  compose() {
    throw "Implement this in child class...";
  }

  /**
   * Adds a node to the appropriate layer of the graph.
   *
   * @param {GraphNode} node - The node to be added to the graph. The node contains
   *                           layer information that determines which layer it belongs to.
   * @return {void} Does not return a value.
   */
  addNode(node: GraphNode) {
    const index = node.getLayerIndex();

    this.addLayer(index);
    const layer = this.getLayer(index);

    node.scheduleOn(layer);
  }

  /**
   * Adds multiple nodes to the graph.
   *
   * @param {GraphNode[]} nodes - An array of nodes to be added to the graph.
   * @return {void} This method does not return a value.
   */
  addNodes(nodes: GraphNode[]) {
    for (const node of nodes) {
      this.addNode(node);
    }
  }

  /**
   * Adds a new layer to the graph at the specified index. If the graph does not exist,
   * it creates the graph using the specified index. Updates the graph's top layer index
   * and maintains the order of layers.
   *
   * @param {number} index - The index at which the new layer should be added to the graph.
   * @return {void} This method does not return a value.
   */
  addLayer(index: number) {
    if (!this.graph) {
      const layer = this.createLayer(index);
      this.graph = layer;
      this.layers.push(layer);
      this.topLayerIndex = index;
      return;
    }

    const lastLayerIndex = this.topLayerIndex + this.layers.length - 1;

    if (index >= this.topLayerIndex && index <= lastLayerIndex) {
      return;
    }

    if (this.topLayerIndex > index) {
      const layer = this.createLayer(this.topLayerIndex - 1);
      layer.setNext(this.layers[0]);
      this.graph = layer;
      this.layers.unshift(layer);
      this.topLayerIndex = this.topLayerIndex - 1;
      this.addLayer(index);
    } else {
      const layer = this.createLayer(lastLayerIndex + 1);
      this.layers[this.layers.length - 1].setNext(layer);
      this.layers.push(layer);
      this.addLayer(index);
    }
  }

  /**
   * Creates a new layer for the graph at the specified index.
   *
   * @param {number} index - The index of the layer to be created.
   * @return {GraphLayer} A new instance of the graph layer corresponding to the provided index.
   */
  createLayer(index: number): GraphLayer {
    const layer = new SyncGraphLayer(index);
    layer.setDebug(this.debug);
    return layer;
  }

  /**
   * Retrieves a specific layer from the current set of layers.
   *
   * @param {number} layerIndex - The index of the layer to retrieve.
   * @return {*} The layer corresponding to the given index.
   */
  getLayer(layerIndex: number) {
    return this.layers[layerIndex - this.topLayerIndex];
  }

  public reset() {
    this.graph = undefined;
    this.topLayerIndex = 0;
    this.layers = [];
  }
}
