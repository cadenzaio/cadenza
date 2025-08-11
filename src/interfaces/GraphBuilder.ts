import SyncGraphLayer from "../graph/execution/SyncGraphLayer";
import GraphNode from "../graph/execution/GraphNode";
import GraphLayer from "./GraphLayer";

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

  compose() {
    throw "Implement this in child class...";
  }

  addNode(node: GraphNode) {
    const index = node.getLayerIndex();

    this.addLayer(index);
    const layer = this.getLayer(index);

    node.scheduleOn(layer);
  }

  protected addNodes(nodes: GraphNode[]) {
    for (const node of nodes) {
      this.addNode(node);
    }
  }

  protected addLayer(index: number) {
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

  protected createLayer(index: number): GraphLayer {
    const layer = new SyncGraphLayer(index);
    layer.setDebug(this.debug);
    return layer;
  }

  protected getLayer(layerIndex: number) {
    return this.layers[layerIndex - this.topLayerIndex];
  }

  public reset() {
    this.graph = undefined;
    this.topLayerIndex = 0;
    this.layers = [];
  }
}
