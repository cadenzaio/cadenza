import SyncGraphLayer from "../graph/execution/SyncGraphLayer";
import Task from "../graph/definition/Task";

/**
 * An abstract class representing a GraphExporter.
 * This class defines a structure for exporting graph data in different formats,
 * depending on the implementations provided by subclasses.
 */
export default abstract class GraphExporter {
  abstract exportGraph(graph: SyncGraphLayer): any;
  abstract exportStaticGraph(graph: Task[]): any;
}
