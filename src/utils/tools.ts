/**
 * Creates a deep clone of the given input object or array, while allowing specific keys to be filtered out based on a provided criteria.
 *
 * @param {T} input The input data to be cloned. It can be an object or an array.
 * @param {(key: string) => boolean} [filterOut] A callback function to determine which keys should be excluded from the cloned structure. It receives the key as a parameter and should return `true` to exclude the key, or `false` to include it. Default is a function that includes all keys (`() => false`).
 * @return {T} Returns a deep clone of the input object or array with the specified keys filtered out.
 */
export function deepCloneFilter<T>(
  input: T,
  filterOut: (key: string) => boolean = () => false,
): T {
  if (input === null || typeof input !== "object") {
    return input;
  }

  const visited = new WeakMap<any, any>(); // For cycle detection

  const stack: Array<{ source: any; target: any; key?: string }> = [];
  const output = Array.isArray(input) ? [] : {};

  stack.push({ source: input, target: output });
  visited.set(input, output);

  while (stack.length) {
    const { source, target, key } = stack.pop()!;
    const currentTarget = key !== undefined ? target[key] : target;

    if (
      // TODO Should probably not be done like this...
      key === "taskInstance" ||
      key === "routineInstance" ||
      key === "task" ||
      key === "routine" ||
      key === "tasks" ||
      key === "routines" ||
      key === "httpServer" ||
      key === "httpsServer"
    ) {
      target[key] = source;
      continue;
    }

    for (const [k, value] of Object.entries(source)) {
      if (filterOut(k)) continue;

      if (value && typeof value === "object") {
        if (visited.has(value)) {
          currentTarget[k] = visited.get(value); // Cycle: link to existing clone
          continue;
        }

        const clonedValue = Array.isArray(value) ? [] : {};
        currentTarget[k] = clonedValue;
        visited.set(value, clonedValue);

        stack.push({ source: value, target: currentTarget, key: k });
      } else {
        currentTarget[k] = value;
      }
    }
  }

  return output as T;
}

/**
 * Converts a given timestamp to an ISO 8601 formatted string.
 *
 * @param {number} timestamp - The timestamp in milliseconds to be formatted.
 * @return {string} The ISO 8601 formatted date string.
 */
export function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toISOString();
}
