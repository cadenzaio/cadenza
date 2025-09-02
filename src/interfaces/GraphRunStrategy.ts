import GraphNode from "../graph/execution/GraphNode";
import GraphBuilder from "./GraphBuilder";
import GraphRun from "../engine/GraphRun";
import GraphBreadthFirstBuilder from "../engine/builders/GraphBreadthFirstBuilder";

export default abstract class GraphRunStrategy {
  graphBuilder: GraphBuilder;
  runInstance?: GraphRun;

  constructor() {
    this.graphBuilder = new GraphBreadthFirstBuilder();
  }

  setRunInstance(runInstance: GraphRun) {
    this.runInstance = runInstance;
  }

  changeStrategy(builder: GraphBuilder) {
    this.graphBuilder = builder;
  }

  reset() {
    this.graphBuilder.reset();
  }

  addNode(node: GraphNode) {
    this.graphBuilder.addNode(node);
  }

  updateRunInstance() {
    this.runInstance?.setGraph(this.graphBuilder.getResult());
  }

  abstract run(): void;
  abstract export(): any;
}
