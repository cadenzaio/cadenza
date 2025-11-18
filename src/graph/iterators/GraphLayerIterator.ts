import Iterator from "../../interfaces/Iterator";
import SyncGraphLayer from "../execution/SyncGraphLayer";
import GraphLayer from "../../interfaces/GraphLayer";

/**
 * The `GraphLayerIterator` class provides an iterator for traversing through
 * layers of a `GraphLayer` data structure. It allows sequential and bi-directional
 * iteration, as well as access to the first and last layers in the graph.
 *
 * @implements {Iterator}
 */
export default class GraphLayerIterator implements Iterator {
  graph: GraphLayer;
  currentLayer: GraphLayer | undefined;

  constructor(graph: GraphLayer) {
    this.graph = graph;
  }
  hasNext() {
    return !this.currentLayer || this.currentLayer.hasNext;
  }

  hasPrevious(): boolean {
    return !this.currentLayer || this.currentLayer.hasPreceding;
  }

  next(): GraphLayer {
    if (!this.currentLayer) {
      return this.getFirst();
    } else if (this.hasNext()) {
      this.currentLayer = this.currentLayer.getNext() as GraphLayer;
    }

    // @ts-ignore
    return this.currentLayer;
  }

  previous(): GraphLayer {
    if (!this.currentLayer) {
      this.currentLayer = this.graph;
    } else if (this.hasPrevious()) {
      this.currentLayer = this.currentLayer.getPreceding() as SyncGraphLayer;
    }

    // @ts-ignore
    return this.currentLayer;
  }

  getFirst(): GraphLayer {
    if (!this.currentLayer) {
      this.currentLayer = this.graph;
    }

    while (this.hasPrevious()) {
      this.currentLayer = this.currentLayer?.getPreceding() as SyncGraphLayer;
    }

    return this.currentLayer;
  }

  getLast(): GraphLayer {
    if (!this.currentLayer) {
      this.currentLayer = this.graph;
    }

    while (this.hasNext()) {
      this.currentLayer = this.currentLayer?.getNext() as GraphLayer;
    }

    return this.currentLayer as GraphLayer;
  }
}
