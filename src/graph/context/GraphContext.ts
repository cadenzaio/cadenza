import { v4 as uuid } from "uuid";
import { deepCloneFilter } from "../../utils/tools";
import { AnyObject } from "../../types/global";

/**
 * Represents a context object used within a graph system.
 * Contexts are essentially a container for data that is relevant to a specific task or routine.
 * They are passed down the graph and can be used to store and manipulate data during the execution process.
 * The context is divided into full context, user data, and metadata.
 * Provides methods for accessing, cloning, mutating, combining, and exporting the context data.
 */
export default class GraphContext {
  readonly id: string;
  readonly fullContext: AnyObject; // Raw (for internal)
  readonly userData: AnyObject; // Filtered, frozen
  readonly metadata: AnyObject; // __keys, frozen

  constructor(context: AnyObject) {
    if (Array.isArray(context)) {
      throw new Error("Array contexts not supported"); // Per clarification
    }
    this.fullContext = context;
    this.userData = Object.fromEntries(
      Object.entries(this.fullContext).filter(([key]) => !key.startsWith("__")),
    );
    this.metadata = Object.fromEntries(
      Object.entries(this.fullContext).filter(([key]) => key.startsWith("__")),
    );
    this.id = uuid();
  }

  /**
   * Gets frozen user data (read-only, no clone).
   * @returns Frozen user context.
   */
  getContext(): AnyObject {
    return this.userData;
  }

  /**
   * Clones the current user context data and returns a deep-cloned copy of it.
   *
   * @return {AnyObject} A deep-cloned copy of the user context data.
   */
  getClonedContext(): AnyObject {
    return deepCloneFilter(this.userData);
  }

  /**
   * Gets full raw context (cloned for safety).
   * @returns Cloned full context.
   */
  getFullContext(): AnyObject {
    return this.fullContext;
  }

  /**
   * Creates and returns a deep-cloned version of the fullContext object.
   *
   * @return {AnyObject} A deep copy of the fullContext instance, preserving all nested structures and data.
   */
  getClonedFullContext(): AnyObject {
    return deepCloneFilter(this.fullContext);
  }

  /**
   * Gets frozen metadata (read-only).
   * @returns Frozen metadata object.
   */
  getMetadata(): AnyObject {
    return this.metadata;
  }

  /**
   * Combines the current GraphContext with another GraphContext, merging their user data
   * and full context into a new GraphContext instance.
   *
   * @param {GraphContext} otherContext - The other GraphContext to combine with the current one.
   * @return {GraphContext} A new GraphContext instance containing merged data from both contexts.
   */
  combine(otherContext: GraphContext): GraphContext {
    const newUser = { ...this.userData };
    newUser.joinedContexts = this.userData.joinedContexts
      ? [...this.userData.joinedContexts]
      : [this.userData];

    const otherUser = otherContext.userData;
    if (Array.isArray(otherUser.joinedContexts)) {
      newUser.joinedContexts.push(...otherUser.joinedContexts);
    } else {
      newUser.joinedContexts.push(otherUser);
    }

    const newFull = {
      ...this.fullContext,
      ...otherContext.fullContext,
      ...newUser,
    };
    return new GraphContext(newFull);
  }

  /**
   * Exports the context.
   * @returns Exported object.
   */
  export(): { id: string; context: AnyObject } {
    return {
      id: this.id,
      context: this.getFullContext(),
    };
  }
}
