import { v4 as uuid } from "uuid";
import GraphNode from "../graph/execution/GraphNode";
import GraphExporter from "../interfaces/GraphExporter";
import SyncGraphLayer from "../graph/execution/SyncGraphLayer";
import GraphRunStrategy from "../interfaces/GraphRunStrategy";
import GraphLayer from "../interfaces/GraphLayer";
import VueFlowExporter from "./exporters/vue-flow/VueFlowExporter";

export interface RunJson {
  __id: string;
  __label: string;
  __graph: any;
  __data: any;
}

// A unique execution of the graph
export default class GraphRun {
  readonly id: string;
  private graph: GraphLayer | undefined;
  // @ts-ignore
  private strategy: GraphRunStrategy;
  private exporter: GraphExporter | undefined;

  constructor(strategy: GraphRunStrategy) {
    this.id = uuid();
    this.strategy = strategy;
    this.strategy.setRunInstance(this);
    this.exporter = new VueFlowExporter();
  }

  setGraph(graph: GraphLayer) {
    this.graph = graph;
  }

  addNode(node: GraphNode) {
    this.strategy.addNode(node);
  }

  // Composite function / Command execution
  run(): void | Promise<void> {
    return this.strategy.run();
  }

  // Composite function
  destroy() {
    this.graph?.destroy();
    this.graph = undefined;
    this.exporter = undefined;
  }

  // Composite function
  log() {
    console.log("vvvvvvvvvvvvvvvvv");
    console.log("GraphRun");
    console.log("vvvvvvvvvvvvvvvvv");
    this.graph?.log();
    console.log("=================");
  }

  // Memento
  export(): RunJson {
    if (this.exporter && this.graph) {
      const data = this.strategy.export();
      return {
        __id: this.id,
        __label: data.__startTime ?? this.id,
        __graph: this.exporter?.exportGraph(this.graph as SyncGraphLayer),
        __data: data,
      };
    }

    return {
      __id: this.id,
      __label: this.id,
      __graph: undefined,
      __data: {},
    };
  }

  // Export Strategy
  setExporter(exporter: GraphExporter) {
    this.exporter = exporter;
  }
}
