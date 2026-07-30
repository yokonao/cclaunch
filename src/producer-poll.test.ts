import { expect, test } from "bun:test";
import { startProducerPolling } from "./producer-poll.ts";

function setup() {
  let now = 0;
  let polls = 0;
  const timers: Array<{ callback: () => void; at: number }> = [];
  const logs: string[] = [];

  startProducerPolling(
    async () => {
      polls++;
    },
    300_000,
    (message) => logs.push(message),
    {
      now: () => now,
      setTimeout: (callback, delay) => {
        timers.push({ callback, at: now + delay });
      },
    },
  );

  return {
    logs,
    polls: () => polls,
    tick: (delay = 0) => {
      const timer = timers.shift();
      if (!timer) throw new Error("timer not scheduled");
      now = timer.at + delay;
      timer.callback();
    },
  };
}

test("polls immediately and on time", async () => {
  const polling = setup();

  expect(polling.polls()).toBe(1);
  await Promise.resolve();
  polling.tick();
  expect(polling.polls()).toBe(2);
});

test("polls when a tick is at most 30 seconds late", async () => {
  const polling = setup();

  await Promise.resolve();
  polling.tick(30_000);
  expect(polling.polls()).toBe(2);
});

test("skips a tick more than 30 seconds late", () => {
  const polling = setup();

  polling.tick(30_001);
  expect(polling.polls()).toBe(1);
  expect(polling.logs).toEqual(["producer poll skipped: 30001ms late"]);
});

test("polls on time after a stale tick", async () => {
  const polling = setup();

  await Promise.resolve();
  polling.tick(30_001);
  polling.tick();
  expect(polling.polls()).toBe(2);
});

test("does not overlap polls", async () => {
  let polls = 0;
  let finish = () => {};
  const timers: Array<() => void> = [];

  startProducerPolling(
    async () => {
      polls++;
      if (polls === 1) await new Promise<void>((resolve) => (finish = resolve));
    },
    300_000,
    () => {},
    {
      now: () => 0,
      setTimeout: (callback) => {
        timers.push(callback);
      },
    },
  );

  timers.shift()?.();
  expect(polls).toBe(1);

  finish();
  await Promise.resolve();
  await Promise.resolve();
  timers.shift()?.();
  expect(polls).toBe(2);
});
