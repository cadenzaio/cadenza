import vm from "node:vm";
import ts from "typescript";

import type { TaskFunction } from "../graph/definition/Task";
import type { AnyObject } from "../types/global";
import type { ActorTaskHandler } from "../actors/Actor";
import type { HelperFunction } from "../tools/definitions";
import type {
  RuntimeActorTaskDefinition,
  RuntimeHelperDefinition,
  RuntimeHandlerLanguage,
  RuntimeTaskDefinition,
} from "./types";

const FORBIDDEN_SOURCE_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\bimport\b/,
    message: "Runtime handler source must not contain import statements",
  },
  {
    pattern: /\bexport\b/,
    message: "Runtime handler source must not contain export statements",
  },
  {
    pattern: /\brequire\s*\(/,
    message: "Runtime handler source must not call require()",
  },
  {
    pattern: /\bprocess\b/,
    message: "Runtime handler source must not access process",
  },
  {
    pattern: /\bFunction\s*\(/,
    message: "Runtime handler source must not create dynamic functions",
  },
  {
    pattern: /\beval\s*\(/,
    message: "Runtime handler source must not call eval()",
  },
];

function transpileIfNeeded(
  source: string,
  language: RuntimeHandlerLanguage,
  filename: string,
): string {
  if (language === "js") {
    return source;
  }

  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
    fileName: filename,
    reportDiagnostics: true,
  });

  const diagnostics = result.diagnostics ?? [];
  const blockingDiagnostics = diagnostics.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (blockingDiagnostics.length > 0) {
    const message = blockingDiagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
      .join("; ");
    throw new Error(`TypeScript transpile failed: ${message}`);
  }

  return result.outputText;
}

function createSandbox(): vm.Context {
  const sandbox = Object.create(null) as Record<string, unknown>;

  sandbox.global = undefined;
  sandbox.globalThis = sandbox;
  sandbox.process = undefined;
  sandbox.require = undefined;
  sandbox.module = undefined;
  sandbox.exports = undefined;
  sandbox.Buffer = undefined;
  sandbox.fetch = undefined;
  sandbox.WebSocket = undefined;
  sandbox.XMLHttpRequest = undefined;
  sandbox.setTimeout = undefined;
  sandbox.setInterval = undefined;
  sandbox.clearTimeout = undefined;
  sandbox.clearInterval = undefined;
  sandbox.queueMicrotask = undefined;

  return vm.createContext(sandbox);
}

function compileFunctionFromSource<TFunction extends Function>(
  source: string,
  language: RuntimeHandlerLanguage,
  filename: string,
  label: string,
): TFunction {
  const normalizedSource = String(source ?? "").trim();
  if (!normalizedSource) {
    throw new Error(`${label} source must be a non-empty string`);
  }

  for (const rule of FORBIDDEN_SOURCE_PATTERNS) {
    if (rule.pattern.test(normalizedSource)) {
      throw new Error(rule.message);
    }
  }

  const wrappedSource = `const __runtime_handler = ${normalizedSource};\n__runtime_handler;`;
  const transpiledSource = transpileIfNeeded(
    wrappedSource,
    language,
    filename,
  ).trim();
  const sandbox = createSandbox();
  const script = new vm.Script(transpiledSource, {
    filename,
  });
  const compiled = script.runInContext(sandbox, {
    timeout: 1000,
    displayErrors: true,
    contextCodeGeneration: {
      strings: false,
      wasm: false,
    },
  } as any);

  if (typeof compiled !== "function") {
    throw new Error(`${label} source must evaluate to a function`);
  }

  return compiled as TFunction;
}

export function compileRuntimeTaskFunction(
  definition: RuntimeTaskDefinition,
): TaskFunction {
  return compileFunctionFromSource<TaskFunction>(
    definition.handlerSource,
    definition.language,
    `${definition.name}.runtime-task.${definition.language}`,
    `Task "${definition.name}"`,
  );
}

export function compileRuntimeHelperFunction(
  definition: RuntimeHelperDefinition,
): HelperFunction {
  return compileFunctionFromSource<HelperFunction>(
    definition.handlerSource,
    definition.language,
    `${definition.name}.runtime-helper.${definition.language}`,
    `Helper "${definition.name}"`,
  );
}

export function compileRuntimeActorTaskHandler<
  D extends Record<string, any> = Record<string, any>,
  R = AnyObject,
>(definition: RuntimeActorTaskDefinition): ActorTaskHandler<D, R> {
  return compileFunctionFromSource<ActorTaskHandler<D, R>>(
    definition.handlerSource,
    definition.language,
    `${definition.actorName}.${definition.taskName}.runtime-actor-task.${definition.language}`,
    `Actor task "${definition.taskName}"`,
  );
}
