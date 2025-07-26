export default abstract class Iterator {
  public abstract hasNext(): boolean;
  public abstract hasPrevious?(): boolean;
  public abstract next(): any;
  public abstract previous?(): any;
  public abstract getFirst?(): any;
  public abstract getLast?(): any;
}
