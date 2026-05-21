import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as SubscriptionRef from "effect/SubscriptionRef";

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

export type ConnectionState =
  | { readonly _tag: "connected" }
  | { readonly _tag: "disconnected" }
  | { readonly _tag: "reconnecting" };

export const ConnectionStateConnected: ConnectionState = { _tag: "connected" };
export const ConnectionStateDisconnected: ConnectionState = { _tag: "disconnected" };
export const ConnectionStateReconnecting: ConnectionState = { _tag: "reconnecting" };

// ---------------------------------------------------------------------------
// Queued message
// ---------------------------------------------------------------------------

export interface QueuedMessage {
  readonly channel: string;
  readonly raw: unknown;
  readonly deferred: Deferred.Deferred<unknown, unknown>;
  readonly enqueuedAt: number;
}

// ---------------------------------------------------------------------------
// Queue service shape
// ---------------------------------------------------------------------------

export interface IpcMessageQueueShape {
  readonly enqueue: (channel: string, raw: unknown) => Effect.Effect<unknown>;
  readonly flush: <E, R>(
    handler: (channel: string, raw: unknown) => Effect.Effect<unknown, E, R>,
  ) => Effect.Effect<number, never, R>;
  readonly drain: (error: unknown) => Effect.Effect<void>;
  readonly expireOldMessages: () => Effect.Effect<number>;
  readonly setConnectionState: (state: ConnectionState) => Effect.Effect<ConnectionState>;
  readonly connectionStateRef: SubscriptionRef.SubscriptionRef<ConnectionState>;
  readonly size: Effect.Effect<number>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class IpcMessageQueueTimeoutError extends Data.TaggedError("IpcMessageQueueTimeoutError")<{
  readonly channel: string;
  readonly ageMs: number;
}> {}

export class IpcMessageQueueDrainError extends Data.TaggedError("IpcMessageQueueDrainError")<{
  readonly reason: unknown;
}> {}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class IpcMessageQueue extends Context.Service<IpcMessageQueue, IpcMessageQueueShape>()(
  "t3/desktop/IpcMessageQueue",
) {}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const QUEUE_MAX_SIZE_DEFAULT = 100;
export const MESSAGE_TTL_MILLIS = 30_000; // 30 seconds

// ---------------------------------------------------------------------------
// Maker
// ---------------------------------------------------------------------------

export const makeIpcMessageQueue = Effect.gen(function* () {
  const queueRef = yield* Ref.make<readonly QueuedMessage[]>([]);
  const connectionStateRef = yield* SubscriptionRef.make<ConnectionState>(ConnectionStateConnected);

  const enqueue = Effect.fn("desktop.ipc.queue.enqueue")(function* (
    channel: string,
    raw: unknown,
  ): Effect.Effect<unknown> {
    const now = yield* Clock.currentTimeMillis;
    const deferred = yield* Deferred.make<unknown, unknown>();

    yield* Ref.update(queueRef, (messages) => {
      const updated = [...messages, { channel, raw, deferred, enqueuedAt: now }];
      if (updated.length > QUEUE_MAX_SIZE_DEFAULT) {
        const [dropped, ...rest] = updated;
        // Fail the dropped message silently (it was evicted)
        Deferred.unsafeDone(dropped.deferred)(
          Effect.dieMessage(
            `IPC queue full: dropped oldest message on channel "${dropped.channel}"`,
          ),
        );
        return rest;
      }
      return updated;
    });

    return yield* Deferred.await(deferred);
  });

  const flush = Effect.fn("desktop.ipc.queue.flush")(function* <E, R>(
    handler: (channel: string, raw: unknown) => Effect.Effect<unknown, E, R>,
  ): Effect.Effect<number, never, R> {
    const messages = yield* Ref.getAndSet(queueRef, []);

    let count = 0;
    for (const msg of messages) {
      yield* Effect.matchEffect(handler(msg.channel, msg.raw), {
        onSuccess: (result) => Deferred.succeed(msg.deferred, result),
        onFailure: (error) => Deferred.fail(msg.deferred, error),
      });
      count++;
    }
    return count;
  });

  const drain = Effect.fn("desktop.ipc.queue.drain")(function* (
    error: unknown,
  ): Effect.Effect<void> {
    const messages = yield* Ref.getAndSet(queueRef, []);
    for (const msg of messages) {
      yield* Deferred.fail(msg.deferred, error);
    }
  });

  const expireOldMessages = Effect.fn("desktop.ipc.queue.expire")(function* (): Effect.Effect<number> {
    const now = yield* Clock.currentTimeMillis;
    const cutoff = now - MESSAGE_TTL_MILLIS;

    const expired = yield* Ref.modify(queueRef, (messages) => {
      const expiredList: QueuedMessage[] = [];
      const remaining: QueuedMessage[] = [];
      for (const msg of messages) {
        if (msg.enqueuedAt < cutoff) {
          expiredList.push(msg);
        } else {
          remaining.push(msg);
        }
      }
      return [expiredList, remaining] as const;
    });

    for (const msg of expired) {
      yield* Deferred.fail(
        msg.deferred,
        new IpcMessageQueueTimeoutError({ channel: msg.channel, ageMs: MESSAGE_TTL_MILLIS }),
      );
    }

    return expired.length;
  });

  const setConnectionState = Effect.fn("desktop.ipc.queue.setConnectionState")(
    function* (state: ConnectionState): Effect.Effect<ConnectionState> {
      const prev = yield* SubscriptionRef.get(connectionStateRef);
      yield* SubscriptionRef.set(connectionStateRef, state);
      return prev;
    },
  );

  return IpcMessageQueue.of({
    enqueue,
    flush,
    drain,
    expireOldMessages,
    setConnectionState,
    connectionStateRef,
    size: Ref.get(queueRef).pipe(Effect.map((m) => m.length)),
  } as IpcMessageQueueShape);
});
