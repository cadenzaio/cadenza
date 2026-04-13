function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function sanitizeForJson(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value ?? null;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (typeof value === "symbol") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Set) {
    return Array.from(value).map((entry) => sanitizeForJson(entry, seen));
  }

  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, entry]) => [
      sanitizeForJson(key, seen),
      sanitizeForJson(entry, seen),
    ]);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForJson(entry, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);

    if (!isPlainObject(value)) {
      const clone: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>)) {
        clone[key] = sanitizeForJson(
          (value as Record<string, unknown>)[key],
          seen,
        );
      }
      clone.__type = value.constructor?.name ?? "Object";
      return clone;
    }

    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = sanitizeForJson(entry, seen);
    }
    return result;
  }

  return String(value);
}
