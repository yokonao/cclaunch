const MAX_DELAY = 30_000;

type Timer = (callback: () => void, delay: number) => unknown;

type Clock = {
  now: () => number;
  setTimeout: Timer;
};

const clock: Clock = {
  now: Date.now,
  setTimeout,
};

export function startProducerPolling(
  run: () => Promise<void>,
  interval: number,
  debug: (message: string) => void,
  time: Clock = clock,
): void {
  let polling = false;

  const poll = async (): Promise<void> => {
    if (polling) return;
    polling = true;
    try {
      await run();
    } finally {
      polling = false;
    }
  };

  const schedule = (): void => {
    const expectedAt = time.now() + interval;
    time.setTimeout(() => {
      const delay = time.now() - expectedAt;
      if (delay <= MAX_DELAY) void poll();
      else debug(`producer poll skipped: ${delay}ms late`);
      schedule();
    }, interval);
  };

  schedule();
  void poll();
}
