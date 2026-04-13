import type { InquiryOptions } from "../engine/InquiryBroker";
import type { AnyObject } from "../types/global";
import type { TaskResult } from "../graph/definition/Task";
import Cadenza from "../Cadenza";

export interface RuntimeTools {
  helpers: Record<string, HelperInvoker>;
  globals: Record<string, unknown>;
}

export type HelperFunction = (
  context: AnyObject,
  emit: (signal: string, context: AnyObject) => void,
  inquire: (
    inquiry: string,
    context: AnyObject,
    options: InquiryOptions,
  ) => Promise<AnyObject>,
  tools: RuntimeTools,
  progressCallback: (progress: number) => void,
) => TaskResult;

export type HelperInvoker = (
  context?: AnyObject,
) => TaskResult | Promise<TaskResult>;

export interface ToolDependencyOwner {
  readonly isMeta: boolean;
  helperAliases: Map<string, string>;
  globalAliases: Map<string, string>;
}

function validateAlias(alias: string): string {
  const normalized = String(alias ?? "").trim();
  if (!normalized) {
    throw new Error("Tool dependency alias must be a non-empty string");
  }
  return normalized;
}

function serializeGlobalValue(value: unknown): unknown {
  if (value === undefined || typeof value === "function") {
    throw new Error("Global values must be JSON-serializable");
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new Error(
      `Global values must be JSON-serializable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (nested && typeof nested === "object" && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }

  return value;
}

export class GlobalDefinition {
  readonly name: string;
  readonly description: string;
  readonly version: number = 1;
  readonly isMeta: boolean;
  readonly value: unknown;
  destroyed: boolean = false;

  constructor(
    name: string,
    value: unknown,
    description: string = "",
    isMeta: boolean = false,
  ) {
    this.name = name;
    this.description = description;
    this.isMeta = isMeta;
    this.value = deepFreeze(serializeGlobalValue(value));
  }

  destroy(): void {
    this.destroyed = true;
  }

  export(): Record<string, unknown> {
    return {
      name: this.name,
      description: this.description,
      version: this.version,
      isMeta: this.isMeta,
      value: this.value,
    };
  }
}

export class HelperDefinition implements ToolDependencyOwner {
  readonly name: string;
  readonly description: string;
  readonly version: number = 1;
  readonly isMeta: boolean;
  readonly helperFunction: HelperFunction;
  readonly helperAliases: Map<string, string> = new Map();
  readonly globalAliases: Map<string, string> = new Map();
  destroyed: boolean = false;

  constructor(
    name: string,
    helperFunction: HelperFunction,
    description: string = "",
    isMeta: boolean = false,
  ) {
    this.name = name;
    this.description = description;
    this.isMeta = isMeta;
    this.helperFunction = helperFunction;
  }

  usesHelpers(
    helpers: Record<string, HelperDefinition | undefined>,
  ): this {
    attachHelperDependency(
      this,
      this.name,
      this.version,
      helpers,
      "meta.helper.helper_associated",
    );
    return this;
  }

  usesGlobals(
    globals: Record<string, GlobalDefinition | undefined>,
  ): this {
    attachGlobalDependency(
      this,
      this.name,
      this.version,
      globals,
      "meta.helper.global_associated",
    );
    return this;
  }

  execute(
    context: AnyObject,
    emit: (signal: string, context: AnyObject) => void,
    inquire: (
      inquiry: string,
      context: AnyObject,
      options: InquiryOptions,
    ) => Promise<AnyObject>,
    progressCallback: (progress: number) => void,
  ): TaskResult {
    return Cadenza.executeHelper(
      this,
      context,
      emit,
      inquire,
      progressCallback,
    );
  }

  destroy(): void {
    this.destroyed = true;
  }

  export(): Record<string, unknown> {
    return {
      name: this.name,
      description: this.description,
      version: this.version,
      isMeta: this.isMeta,
      functionString: this.helperFunction.toString(),
      helperAliases: Object.fromEntries(this.helperAliases),
      globalAliases: Object.fromEntries(this.globalAliases),
    };
  }
}

export function attachHelperDependency(
  owner: ToolDependencyOwner,
  ownerName: string,
  ownerVersion: number,
  helpers: Record<string, HelperDefinition | undefined>,
  signalName: "meta.task.helper_associated" | "meta.helper.helper_associated",
): void {
  for (const [alias, helper] of Object.entries(helpers)) {
    const normalizedAlias = validateAlias(alias);
    if (!helper) {
      throw new Error(
        `Helper dependency "${normalizedAlias}" must reference a helper definition`,
      );
    }
    if (helper.isMeta !== owner.isMeta) {
      throw new Error(
        `${ownerName} cannot use ${
          helper.isMeta ? "meta" : "business"
        } helper "${helper.name}" across layer boundaries`,
      );
    }
    owner.helperAliases.set(normalizedAlias, helper.name);
    Cadenza.emit(signalName, {
      data: {
        alias: normalizedAlias,
        ...(signalName === "meta.task.helper_associated"
          ? {
              taskName: ownerName,
              taskVersion: ownerVersion,
            }
          : {
              helperName: ownerName,
              helperVersion: ownerVersion,
            }),
        dependencyHelperName: helper.name,
        dependencyHelperVersion: helper.version,
      },
    });
  }
}

export function attachGlobalDependency(
  owner: ToolDependencyOwner,
  ownerName: string,
  ownerVersion: number,
  globals: Record<string, GlobalDefinition | undefined>,
  signalName: "meta.task.global_associated" | "meta.helper.global_associated",
): void {
  for (const [alias, globalDefinition] of Object.entries(globals)) {
    const normalizedAlias = validateAlias(alias);
    if (!globalDefinition) {
      throw new Error(
        `Global dependency "${normalizedAlias}" must reference a global definition`,
      );
    }
    if (globalDefinition.isMeta !== owner.isMeta) {
      throw new Error(
        `${ownerName} cannot use ${
          globalDefinition.isMeta ? "meta" : "business"
        } global "${globalDefinition.name}" across layer boundaries`,
      );
    }
    owner.globalAliases.set(normalizedAlias, globalDefinition.name);
    Cadenza.emit(signalName, {
      data: {
        alias: normalizedAlias,
        ...(signalName === "meta.task.global_associated"
          ? {
              taskName: ownerName,
              taskVersion: ownerVersion,
            }
          : {
              helperName: ownerName,
              helperVersion: ownerVersion,
            }),
        globalName: globalDefinition.name,
        globalVersion: globalDefinition.version,
      },
    });
  }
}
