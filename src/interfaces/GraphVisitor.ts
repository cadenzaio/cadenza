import GraphNode from "../graph/execution/GraphNode";
import Task from "../graph/definition/Task";
import GraphLayer from "./GraphLayer";

export default abstract class GraphVisitor {
  abstract visitLayer(layer: GraphLayer): any;
  abstract visitNode(node: GraphNode): any;
  abstract visitTask(task: Task): any;
}
