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
