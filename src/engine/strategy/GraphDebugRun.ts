import GraphRunStrategy from "../../interfaces/GraphRunStrategy";
import GraphNode from "../../graph/execution/GraphNode";

export default class GraphDebugRun extends GraphRunStrategy {
  private executionTime: number = 0;
  private shouldReset = true;
  private startTime: number = 0;

  run() {
    const start = this.start();

    this.graphBuilder.compose();
    this.updateRunInstance();

    this.shouldReset = true;
    this.end(start);
  }

  start() {
    this.startTime = Date.now();
    return performance.now();
  }

  end(start: number) {
    const end = performance.now();
    this.executionTime = end - start;
    return end;
  }

  export(): any {
    return {
      __executionTime: this.executionTime,
      __startTime: new Date(this.startTime).toTimeString(),
    };
  }

  addNode(node: GraphNode) {
    if (this.shouldReset) {
      this.reset();
    }
    this.shouldReset = false;

    super.addNode(node);
  }

  reset() {
    super.reset();
    this.executionTime = 0;
  }
}
