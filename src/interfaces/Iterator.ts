/**
 * Abstract class representing an iterator for traversing a collection of elements.
 * Subclasses must implement core methods to allow iteration and may optionally implement additional methods for extended functionality.
 */
export default abstract class Iterator {
  public abstract hasNext(): boolean;
  public abstract hasPrevious?(): boolean;
  public abstract next(): any;
  public abstract previous?(): any;
  public abstract getFirst?(): any;
  public abstract getLast?(): any;
}
