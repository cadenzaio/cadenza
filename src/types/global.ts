export type AnyObject = { [key: string | number]: any };

export interface ThrottleHandle {
  /** Stop the repeating emission */
  clear(): void;
}
