import { describe, expect, it, vi } from "vitest";

/**
 * Simple in-memory FIFO message queue (no Effect dependencies for testing).
 */
interface QueuedMessage {
  channel: string;
  raw: unknown;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  enqueuedAt: number;
}

function createMessageQueue(maxSize = 100, ttlMs = 30000) {
  const queue: QueuedMessage[] = [];
  let connectionState: "connected" | "disconnected" | "reconnecting" = "connected";
  const stateListeners: Array<(s: string) => void> = [];

  return {
    enqueue(channel: string, raw: unknown): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const now = Date.now();
        if (queue.length >= maxSize) {
          // Drop oldest
          const dropped = queue.shift()!;
          dropped.reject(new Error(`Queue full: dropped "${dropped.channel}"`));
        }
        queue.push({ channel, raw, resolve, reject, enqueuedAt: now });
      });
    },

    async flush(
      handler: (channel: string, raw: unknown) => Promise<unknown>,
    ): Promise<number> {
      const messages = [...queue];
      queue.length = 0;
      let count = 0;
      for (const msg of messages) {
        try {
          const result = await handler(msg.channel, msg.raw);
          msg.resolve(result);
          count++;
        } catch (e) {
          msg.reject(e);
        }
      }
      return count;
    },

    drain(error: unknown): void {
      const messages = [...queue];
      queue.length = 0;
      for (const msg of messages) {
        msg.reject(error);
      }
    },

    expireOldMessages(): number {
      const now = Date.now();
      const cutoff = now - ttlMs;
      let count = 0;
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].enqueuedAt < cutoff) {
          const expired = queue.splice(i, 1)[0];
          expired.reject(new Error(`TimeoutError: "${expired.channel}" expired after ${ttlMs}ms`));
          count++;
        }
      }
      return count;
    },

    setConnectionState(state: "connected" | "disconnected" | "reconnecting"): string {
      const prev = connectionState;
      connectionState = state;
      stateListeners.forEach((fn) => fn(state));
      return prev;
    },

    getConnectionState(): string {
      return connectionState;
    },

    onStateChange(fn: (s: string) => void) {
      stateListeners.push(fn);
    },

    get size() {
      return queue.length;
    },

    get messages() {
      return [...queue];
    },
  };
}

describe("IpcMessageQueue", () => {
  it("starts in connected state", () => {
    const q = createMessageQueue();
    expect(q.getConnectionState()).toBe("connected");
  });

  it("enqueues messages when disconnected and flushes on reconnect", async () => {
    const q = createMessageQueue();
    q.setConnectionState("disconnected");

    const enqueuePromise = q.enqueue("test:channel", { data: 42 });
    expect(q.size).toBe(1);

    const handler = vi.fn().mockResolvedValue("ok");
    const flushed = await q.flush(handler);
    expect(flushed).toBe(1);

    const result = await enqueuePromise;
    expect(result).toBe("ok");
  });

  it("drains all queued messages with error", async () => {
    const q = createMessageQueue();
    q.setConnectionState("disconnected");

    const f1 = q.enqueue("ch1", "a");
    const f2 = q.enqueue("ch2", "b");
    expect(q.size).toBe(2);

    q.drain("backend shutdown");

    await expect(f1).rejects.toBe("backend shutdown");
    await expect(f2).rejects.toBe("backend shutdown");
    expect(q.size).toBe(0);
  });

  it("flushes messages in FIFO order", async () => {
    const q = createMessageQueue();
    q.setConnectionState("disconnected");

    q.enqueue("ch", "A");
    q.enqueue("ch", "B");
    q.enqueue("ch", "C");

    const order: string[] = [];
    const flushed = await q.flush(async (_ch, raw) => {
      order.push(raw as string);
      return "ok";
    });
    expect(flushed).toBe(3);
    expect(order).toEqual(["A", "B", "C"]);
  });

  it("tracks connection state transitions", () => {
    const q = createMessageQueue();

    expect(q.setConnectionState("disconnected")).toBe("connected");
    expect(q.setConnectionState("reconnecting")).toBe("disconnected");
    expect(q.setConnectionState("connected")).toBe("reconnecting");
    expect(q.getConnectionState()).toBe("connected");
  });

  it("drops oldest message when queue is full", async () => {
    const maxSize = 5;
    const q = createMessageQueue(maxSize);
    q.setConnectionState("disconnected");

    // Fill to max
    const promises: Array<Promise<unknown>> = [];
    for (let i = 0; i < maxSize; i++) {
      promises.push(q.enqueue(`ch:${i}`, i));
    }
    expect(q.size).toBe(maxSize);

    // Overflow
    const overflowPromise = q.enqueue("overflow", "x");
    expect(q.size).toBe(maxSize); // Still max (one was dropped)

    // The first promise was dropped
    await expect(promises[0]).rejects.toThrow("Queue full");

    // Flush — all remaining in FIFO order
    const order: unknown[] = [];
    await q.flush(async (_ch, raw) => {
      order.push(raw);
      return "ok";
    });

    // overflow should resolve
    await expect(overflowPromise).resolves.toBe("ok");
    // First item was dropped, so order starts with ch:1
    expect(order[0]).toBe(1);
    expect(order[order.length - 1]).toBe("x");
  });

  it("expires old messages after TTL", async () => {
    const q = createMessageQueue(100, 100); // 100ms TTL
    q.setConnectionState("disconnected");

    // Enqueue and wait for expiry
    const promise = q.enqueue("expire-me", "data");
    expect(q.size).toBe(1);

    // Wait for TTL to pass
    await new Promise((r) => setTimeout(r, 150));

    const expired = q.expireOldMessages();
    expect(expired).toBe(1);
    expect(q.size).toBe(0);

    await expect(promise).rejects.toThrow("TimeoutError");
  });

  it("notifies state listeners on connection change", () => {
    const q = createMessageQueue();
    const states: string[] = [];
    q.onStateChange((s) => states.push(s));

    q.setConnectionState("disconnected");
    q.setConnectionState("connected");

    expect(states).toEqual(["disconnected", "connected"]);
  });
});
