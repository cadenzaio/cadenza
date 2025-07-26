import GraphRunStrategy from "../../interfaces/GraphRunStrategy";

export default class GraphStandardRun extends GraphRunStrategy {
  run() {
    this.graphBuilder.compose();
    this.updateRunInstance();
    this.reset();
  }

  export(): any {
    return {};
  }
}
