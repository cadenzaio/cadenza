/**
 * Deep clones an input with optional filter.
 * @param input The input to clone.
 * @param filterOut Predicate to skip keys (true = skip).
 * @returns Cloned input.
 * @edge Handles arrays/objects; skips cycles with visited.
 * @edge Primitives returned as-is; functions copied by reference.
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
      key === "__taskInstance" ||
      key === "__routineInstance" ||
      key === "__task" ||
      key === "__routine"
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

export function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toISOString();
}
