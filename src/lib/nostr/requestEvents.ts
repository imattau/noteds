import { defer, filter, map, merge, scan, share, switchMap, take, timer, type OperatorFunction } from 'rxjs';

export interface ObservableSubscription {
  unsubscribe(): void;
}

export interface ObservableLike<T> {
  subscribe(
    observer: {
      next?: (value: T | 'EOSE') => void;
      error?: (error: unknown) => void;
      complete?: () => void;
    } | ((value: T | 'EOSE') => void)
  ): ObservableSubscription;
}

export async function collectEvents<T>(source: ObservableLike<T>, timeoutMs: number): Promise<T[]> {
  return await new Promise<T[]>((resolve) => {
    const events: T[] = [];
    let settled = false;
    let subscription: ObservableSubscription | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: T[]): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      try {
        subscription?.unsubscribe();
      } catch {
        // Best effort cleanup.
      }
      resolve(result);
    };

    subscription = source.subscribe({
      next: (value) => {
        if (value === 'EOSE') {
          finish(events);
          return;
        }
        events.push(value);
      },
      error: () => {
        finish(events);
      },
      complete: () => {
        finish(events);
      }
    });

    timer = setTimeout(() => {
      finish(events);
    }, timeoutMs);
  });
}

/** The subset of applesauce's group request messages the settle rule reads. */
interface RelayStatusMessage {
  type: string;
  from: string;
}

const SETTLED_MESSAGE_TYPES = new Set(['EOSE', 'CLOSED', 'ERROR']);

export interface SettleEarlyOptions {
  /** Relays that must finish before the grace period starts (capped at the relay count). */
  quorum?: number;
  /** How long to wait for the remaining relays once the quorum has finished. */
  graceMs?: number;
}

/**
 * Completion rule for applesauce group requests: finish when every relay has
 * answered, or `graceMs` after `quorum` relays have. A relay counts as
 * answered on EOSE, CLOSED (e.g. rate limiting) or a connection error, so one
 * slow or dead relay no longer holds a lookup until its timeout.
 */
export function completeWhenSettled(
  relayCount: number,
  { quorum = 2, graceMs = 500 }: SettleEarlyOptions = {}
): OperatorFunction<RelayStatusMessage, boolean> {
  const needed = Math.max(1, Math.min(quorum, relayCount));
  return (source) =>
    defer(() => {
      const settledCount$ = source.pipe(
        filter((message) => SETTLED_MESSAGE_TYPES.has(message.type)),
        scan((settled, message) => settled.add(message.from), new Set<string>()),
        map((settled) => settled.size),
        share()
      );
      return merge(
        settledCount$.pipe(filter((count) => count >= relayCount)),
        settledCount$.pipe(
          filter((count) => count >= needed),
          take(1),
          switchMap(() => timer(graceMs))
        )
      ).pipe(map(() => true));
    });
}

/** Request options for read-only lookups where a near-complete answer beats waiting on stragglers. */
export function settleEarly(relays: string[], options?: SettleEarlyOptions) {
  return { complete: completeWhenSettled(relays.length, options) };
}
