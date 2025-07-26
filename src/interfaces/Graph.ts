import GraphVisitor from "./GraphVisitor";
import Iterator from "./Iterator";

export default abstract class Graph {
  /**
   * Executes this graph node/task.
   * @param args Execution args (e.g., context).
   * @returns Result.
   */
  abstract execute(...args: any[]): unknown;

  /**
   * Logs the graph node (debugging).
   */
  abstract log(): void;

  /**
   * Destroys the graph node.
   */
  abstract destroy(): void;

  /**
   * Exports the graph node.
   * @returns Exported data.
   */
  abstract export(): any;

  /**
   * Accepts a visitor for traversal (e.g., debugging/exporters).
   * @param visitor The visitor.
   * @note Non-runtime use; pairs with iterator for data extraction.
   */
  abstract accept(visitor: GraphVisitor): void;

  /**
   * Gets an iterator for graph traversal (e.g., BFS/DFS).
   * @returns Iterator.
   * @note For debugging/exporters.
   */
  abstract getIterator(): Iterator;
}
