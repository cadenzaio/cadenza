/**
 * Represents an abstract chain of execution, where each instance can be
 * connected to a succeeding or preceding instance to form a chain of steps.
 * Provides methods to manage the links between instances in the chain.
 */
export default abstract class ExecutionChain {
  next: ExecutionChain | undefined;
  previous: ExecutionChain | undefined;

  public setNext(next: ExecutionChain): void {
    if (this.hasNext) {
      return;
    }

    next.previous = this;
    this.next = next;
  }

  get hasNext() {
    return !!this.next;
  }

  get hasPreceding() {
    return !!this.previous;
  }

  getNext() {
    return this.next;
  }

  getPreceding() {
    return this.previous;
  }

  decouple() {
    this.next = undefined;
    this.previous = undefined;
  }
}
