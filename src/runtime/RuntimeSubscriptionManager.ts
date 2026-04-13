import { v4 as uuid } from "uuid";

import Cadenza from "../Cadenza";
import type { SignalMetadata } from "../engine/SignalBroker";
import type { AnyObject } from "../types/global";
import { sanitizeForJson } from "./sanitize";
import type {
  RuntimeNextEventResult,
  RuntimePollEventsResult,
  RuntimeSignalEvent,
  RuntimeSubscription,
} from "./types";

interface SubscriptionWaiter {
  resolve: (result: RuntimeNextEventResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout | null;
}

interface SubscriptionState {
  descriptor: RuntimeSubscription;
  events: RuntimeSignalEvent[];
  nextWaiter: SubscriptionWaiter | null;
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeEventContext(context: AnyObject): Record<string, unknown> {
  const sanitized = sanitizeForJson(context);
  return isObject(sanitized) ? sanitized : { value: sanitized };
}

function matchesSignalPattern(
  fullSignal: string,
  signalName: string,
  patterns: string[],
): boolean {
  return patterns.some((pattern) => {
    if (pattern === "*") {
      return true;
    }

    if (pattern === fullSignal || pattern === signalName) {
      return true;
    }

    if (!pattern.endsWith(".*")) {
      return false;
    }

    const prefix = pattern.slice(0, -2);
    return signalName === prefix || signalName.startsWith(`${prefix}.`);
  });
}

export class RuntimeSubscriptionManagerError extends Error {
  constructor(
    readonly code: "not_found" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "RuntimeSubscriptionManagerError";
  }
}

export class RuntimeSubscriptionManager {
  private subscriptions = new Map<string, SubscriptionState>();
  private removeBrokerListener: (() => void) | null = null;
  private nextSequence = 0;

  constructor() {
    this.attach();
  }

  dispose(): void {
    this.reset();
    this.removeBrokerListener?.();
    this.removeBrokerListener = null;
  }

  subscribe(signalPatterns: string[], maxQueueSize: number): RuntimeSubscription {
    this.attach();

    const descriptor: RuntimeSubscription = {
      subscriptionId: uuid(),
      signalPatterns: [...signalPatterns],
      maxQueueSize,
      createdAt: new Date().toISOString(),
      pendingEvents: 0,
    };

    this.subscriptions.set(descriptor.subscriptionId, {
      descriptor,
      events: [],
      nextWaiter: null,
    });

    return { ...descriptor };
  }

  unsubscribe(subscriptionId: string): RuntimeSubscription {
    const subscription = this.requireSubscription(subscriptionId);
    this.clearWaiter(
      subscription,
      new RuntimeSubscriptionManagerError(
        "not_found",
        `Subscription "${subscriptionId}" was closed`,
      ),
    );
    this.subscriptions.delete(subscriptionId);
    return { ...subscription.descriptor };
  }

  async nextEvent(
    subscriptionId: string,
    timeoutMs: number,
  ): Promise<RuntimeNextEventResult> {
    const subscription = this.requireSubscription(subscriptionId);

    if (subscription.events.length > 0) {
      const event = subscription.events.shift() ?? null;
      subscription.descriptor.pendingEvents = subscription.events.length;
      return {
        subscriptionId,
        event,
        timedOut: false,
        pendingEvents: subscription.events.length,
      };
    }

    if (timeoutMs <= 0) {
      return {
        subscriptionId,
        event: null,
        timedOut: true,
        pendingEvents: 0,
      };
    }

    if (subscription.nextWaiter) {
      throw new RuntimeSubscriptionManagerError(
        "conflict",
        `Subscription "${subscriptionId}" already has a pending nextEvent request`,
      );
    }

    return new Promise<RuntimeNextEventResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        subscription.nextWaiter = null;
        resolve({
          subscriptionId,
          event: null,
          timedOut: true,
          pendingEvents: subscription.events.length,
        });
      }, timeoutMs);

      subscription.nextWaiter = {
        resolve: (result) => {
          clearTimeout(timer);
          subscription.nextWaiter = null;
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          subscription.nextWaiter = null;
          reject(error);
        },
        timer,
      };
    });
  }

  pollEvents(
    subscriptionId: string,
    limit: number,
  ): RuntimePollEventsResult {
    const subscription = this.requireSubscription(subscriptionId);
    const events = subscription.events.splice(0, limit);
    subscription.descriptor.pendingEvents = subscription.events.length;

    return {
      subscriptionId,
      events,
      pendingEvents: subscription.events.length,
    };
  }

  reset(): void {
    for (const subscription of this.subscriptions.values()) {
      this.clearWaiter(
        subscription,
        new RuntimeSubscriptionManagerError(
          "not_found",
          `Subscription "${subscription.descriptor.subscriptionId}" was reset`,
        ),
      );
      subscription.events.length = 0;
      subscription.descriptor.pendingEvents = 0;
    }

    this.subscriptions.clear();
  }

  private attach(): void {
    if (this.removeBrokerListener) {
      return;
    }

    Cadenza.bootstrap();
    this.removeBrokerListener = Cadenza.signalBroker.addPassiveSignalListener(
      (signal, context, metadata) =>
        this.captureSignal(signal, context, metadata),
    );
  }

  private captureSignal(
    signal: string,
    context: AnyObject,
    metadata: SignalMetadata | null,
  ): void {
    if (this.subscriptions.size === 0) {
      return;
    }

    const normalizedContext = normalizeEventContext(context);
    const emission = isObject(normalizedContext.__signalEmission)
      ? normalizedContext.__signalEmission
      : {};
    const metadataObject = isObject(normalizedContext.__metadata)
      ? normalizedContext.__metadata
      : {};

    const fullSignal = signal;
    const [baseSignalName, ...signalTagParts] = signal.split(":");
    const signalName = baseSignalName ?? signal;
    const signalTag =
      signalTagParts.length > 0 ? signalTagParts.join(":") : null;
    const eventTemplate = {
      type: "signal" as const,
      signal: fullSignal,
      signalName,
      signalTag,
      emittedAt: asStringOrNull(emission.emittedAt),
      isMeta: emission.isMeta === true || signalName.startsWith("meta."),
      isSubMeta:
        normalizedContext.__isSubMeta === true ||
        signalName.startsWith("sub_meta."),
      metadata:
        (sanitizeForJson(metadata) as Record<string, unknown> | null) ?? null,
      source: {
        taskName: asStringOrNull(emission.taskName),
        taskVersion: asNumberOrNull(emission.taskVersion),
        taskExecutionId: asStringOrNull(emission.taskExecutionId),
        routineName:
          asStringOrNull(normalizedContext.__routineName) ??
          asStringOrNull(emission.routineName),
        routineVersion:
          asNumberOrNull(normalizedContext.__routineVersion) ??
          asNumberOrNull(emission.routineVersion),
        routineExecutionId:
          asStringOrNull(normalizedContext.__routineExecId) ??
          asStringOrNull(emission.routineExecutionId),
        executionTraceId:
          asStringOrNull(emission.executionTraceId) ??
          asStringOrNull(normalizedContext.__executionTraceId) ??
          asStringOrNull(metadataObject.__executionTraceId),
        consumed: emission.consumed === true,
        consumedBy: asStringOrNull(emission.consumedBy),
      },
      context: normalizedContext,
    };

    for (const subscription of this.subscriptions.values()) {
      if (
        !matchesSignalPattern(
          fullSignal,
          signalName,
          subscription.descriptor.signalPatterns,
        )
      ) {
        continue;
      }

      const event: RuntimeSignalEvent = {
        id: uuid(),
        subscriptionId: subscription.descriptor.subscriptionId,
        sequence: ++this.nextSequence,
        ...eventTemplate,
      };

      if (subscription.nextWaiter) {
        subscription.nextWaiter.resolve({
          subscriptionId: subscription.descriptor.subscriptionId,
          event,
          timedOut: false,
          pendingEvents: subscription.events.length,
        });
        continue;
      }

      subscription.events.push(event);
      if (subscription.events.length > subscription.descriptor.maxQueueSize) {
        subscription.events.shift();
      }
      subscription.descriptor.pendingEvents = subscription.events.length;
    }
  }

  private clearWaiter(
    subscription: SubscriptionState,
    error: Error,
  ): void {
    if (!subscription.nextWaiter) {
      return;
    }

    if (subscription.nextWaiter.timer) {
      clearTimeout(subscription.nextWaiter.timer);
    }

    subscription.nextWaiter.reject(error);
    subscription.nextWaiter = null;
  }

  private requireSubscription(subscriptionId: string): SubscriptionState {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new RuntimeSubscriptionManagerError(
        "not_found",
        `No subscription named "${subscriptionId}" exists`,
      );
    }
    return subscription;
  }
}
