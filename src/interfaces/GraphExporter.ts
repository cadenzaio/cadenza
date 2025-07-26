import SyncGraphLayer from "../graph/execution/SyncGraphLayer";
import Task from "../graph/definition/Task";

export default abstract class GraphExporter {
  abstract exportGraph(graph: SyncGraphLayer): any;
  abstract exportStaticGraph(graph: Task[]): any;
}
