// Keeps calls at least `intervalMs` apart. Each call reserves its slot before it waits, so calls that start
// together still go out one interval after another.
export interface Throttle {
  wait(): Promise<void>;
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export function createThrottle(intervalMs: number, clock: Clock = realClock): Throttle {
  let next = -Infinity;
  return {
    async wait() {
      const now = clock.now();
      const at = Math.max(now, next);
      next = at + intervalMs;
      if (at > now) await clock.sleep(at - now);
    },
  };
}
