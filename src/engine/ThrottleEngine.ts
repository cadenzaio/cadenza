import GraphNode from "../graph/execution/GraphNode";

type ProcessFunction = (node: GraphNode) => Promise<GraphNode[]> | GraphNode[];

/**
 * The ThrottleEngine class provides a mechanism for controlling the concurrency level
 * of function execution, grouped by tags. It ensures that no more than the specified
 * maximum number of functions per tag run concurrently.
 */
export default class ThrottleEngine {
  static instance_: ThrottleEngine;

  static get instance() {
    if (!this.instance_) {
      this.instance_ = new ThrottleEngine();
    }
    return this.instance_;
  }

  queues: { [tag: string]: [ProcessFunction, GraphNode][] } = {};
  runningCounts: { [tag: string]: number } = {};
  maxConcurrencyPerTag: { [tag: string]: number } = {};

  functionIdToPromiseResolve: {
    [functionInstanceId: string]: (value: GraphNode[]) => void;
  } = {};

  /**
   * Set a custom concurrency limit for a specific tag
   */
  setConcurrencyLimit(tag: string, limit: number) {
    this.maxConcurrencyPerTag[tag] = limit;
  }

  /**
   * Manages the execution of a function `fn` applied on a specified node `node` with controlled concurrency for a given tag.
   * The method ensures that processes are executed in a throttled manner, respecting the maximum concurrency for each tag.
   *
   * @param {ProcessFunction} fn - The function to be executed on the provided node.
   * @param {GraphNode} node - The graph node on which the function `fn` will be applied.
   * @param {string} [tag="default"] - The concurrency grouping tag used to control and group the throttling behavior.
   * @return {Promise<GraphNode[]>} A promise resolving to an array of GraphNode objects once the throttled function execution completes.
   */
  throttle(
    fn: ProcessFunction,
    node: GraphNode,
    tag: string = "default",
  ): Promise<GraphNode[]> {
    const functionPromise = new Promise((resolve) => {
      this.functionIdToPromiseResolve[node.id] = resolve as (
        value: GraphNode[],
      ) => void;
    }) as Promise<GraphNode[]>;

    this.queues[tag] ??= [];
    this.queues[tag].push([fn, node]);

    // Default to 1 if not set
    this.maxConcurrencyPerTag[tag] ??= 1;

    this.processQueue(tag);

    return functionPromise;
  }

  /**
   * Processes the tasks in the queue for a given tag while respecting concurrency limits.
   *
   * @param {string} tag - The identifier for the queue to be processed, used to group tasks and manage concurrency controls.
   * @return {void} Does not return a value; it processes tasks asynchronously and manages state internally.
   */
  processQueue(tag: string) {
    const maxAllowed = this.maxConcurrencyPerTag[tag];

    while (
      (this.queues[tag]?.length ?? 0) > 0 &&
      (this.runningCounts[tag] ?? 0) < maxAllowed
    ) {
      this.runningCounts[tag] = (this.runningCounts[tag] || 0) + 1;
      const item = this.queues[tag].shift()!;
      this.process(item).then(() => {
        this.runningCounts[tag]--;
        this.processQueue(tag); // Re-check queue
      });
    }

    // Clean up if done
    if (
      (this.queues[tag]?.length ?? 0) === 0 &&
      this.runningCounts[tag] === 0
    ) {
      delete this.queues[tag];
      delete this.runningCounts[tag];
    }
  }

  /**
   * Processes a given item consisting of a function and a graph node.
   *
   * @param {Array} item - An array where the first element is a processing function and the second element is a graph node.
   * @param {Function} item[0] - The function to process the graph node.
   * @param {GraphNode} item[1] - The graph node to be processed.
   * @return {Promise<void>} A promise that resolves when the processing and cleanup are complete.
   */
  async process(item: [ProcessFunction, GraphNode]) {
    const fn = item[0];
    const node = item[1];

    const context = await fn(node);

    this.functionIdToPromiseResolve[node.id](context);
    delete this.functionIdToPromiseResolve[node.id];
  }
}
