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

  private tagState = new Map<
    string,
    {
      queue: [ProcessFunction, GraphNode, number][];
      runningCount: number;
      maxConcurrency: number;
    }
  >();

  private nextId = 0;

  private pendingResolves = new Map<number, (value: GraphNode[]) => void>();

  private getTagState(tag: string) {
    let state = this.tagState.get(tag);
    if (!state) {
      state = {
        queue: [],
        runningCount: 0,
        maxConcurrency: 1,
      };
      this.tagState.set(tag, state);
    }
    return state;
  }

  /**
   * Set a custom concurrency limit for a specific tag
   */
  setConcurrencyLimit(tag: string, limit: number) {
    const state = this.getTagState(tag);
    state.maxConcurrency = limit;
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
    const state = this.getTagState(tag);

    const id = this.nextId++;
    const functionPromise = new Promise<GraphNode[]>((resolve) => {
      this.pendingResolves.set(id, resolve);
    });

    state.queue.push([fn, node, id]);

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
    const tagData = this.tagState.get(tag);
    if (!tagData) return;

    const maxAllowed = tagData.maxConcurrency;

    const processNext = () => {
      while (tagData.queue.length > 0 && tagData.runningCount < maxAllowed) {
        tagData.runningCount++;
        const item = tagData.queue.shift()!;
        this.process(item)
          .catch(() => []) // Handle errors gracefully
          .finally(() => {
            tagData.runningCount--;
            processNext(); // Continue processing
          });
      }

      // Clean up processing tags if finished, but keep tagState for persistence
      if (tagData.queue.length === 0 && tagData.runningCount === 0) {
        // Optionally, add idle timeout here if needed in future
      }
    };

    processNext();
  }

  /**
   * Processes a given item consisting of a function and a graph node.
   *
   * @param {Array} item - An array where the first element is a processing function, the second element is a graph node, and the third is the unique ID.
   * @param {Function} item[0] - The function to process the graph node.
   * @param {GraphNode} item[1] - The graph node to be processed.
   * @param {number} item[2] - The unique ID for promise resolution.
   * @return {Promise<void>} A promise that resolves when the processing and cleanup are complete.
   */
  async process(item: [ProcessFunction, GraphNode, number]) {
    const fn = item[0];
    const node = item[1];
    const id = item[2];

    try {
      const context = await fn(node);
      this.pendingResolves.get(id)?.(context);
    } catch (e) {
      this.pendingResolves.get(id)?.([]);
    } finally {
      this.pendingResolves.delete(id);
    }
  }
}
