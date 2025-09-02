import { v4 as uuid } from "uuid";
import { deepCloneFilter } from "../../utils/tools";
import { AnyObject } from "../../types/global";

export default class GraphContext {
  readonly id: string;
  readonly fullContext: AnyObject; // Raw (for internal)
  readonly userData: AnyObject; // Filtered, frozen
  readonly metaData: AnyObject; // __keys, frozen

  constructor(context: AnyObject) {
    if (Array.isArray(context)) {
      throw new Error("Array contexts not supported"); // Per clarification
    }
    this.fullContext = context; // Clone once
    this.userData = Object.fromEntries(
      Object.entries(this.fullContext).filter(([key]) => !key.startsWith("__")),
    );
    this.metaData = Object.fromEntries(
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

  getClonedFullContext(): AnyObject {
    return deepCloneFilter(this.fullContext);
  }

  /**
   * Gets frozen metadata (read-only).
   * @returns Frozen metadata object.
   */
  getMetaData(): AnyObject {
    return this.metaData;
  }

  /**
   * Clones this context (new instance).
   * @returns New GraphContext.
   */
  clone(): GraphContext {
    return this.mutate(this.fullContext);
  }

  /**
   * Creates new context from data (via registry).
   * @param context New data.
   * @returns New GraphContext.
   */
  mutate(context: AnyObject): GraphContext {
    return new GraphContext(context);
  }

  /**
   * Combines with another for uniques (joins userData).
   * @param otherContext The other.
   * @returns New combined GraphContext.
   * @edge Appends other.userData to joinedContexts in userData.
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
  export(): { __id: string; __context: AnyObject } {
    return {
      __id: this.id,
      __context: this.getFullContext(),
    };
  }
}
