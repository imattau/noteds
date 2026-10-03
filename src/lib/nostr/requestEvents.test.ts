import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeWhenSettled } from './requestEvents';

type Message = { type: string; from: string };

function watch(relayCount: number, options?: { quorum?: number; graceMs?: number }) {
  const source = new Subject<Message>();
  const completed = vi.fn();
  completeWhenSettled(relayCount, options)(source).subscribe(completed);
  return { source, completed };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('completeWhenSettled', () => {
  it('completes immediately once every relay has answered', () => {
    const { source, completed } = watch(2);
    source.next({ type: 'EOSE', from: 'a' });
    expect(completed).not.toHaveBeenCalled();
    source.next({ type: 'EOSE', from: 'b' });
    expect(completed).toHaveBeenCalledWith(true);
  });

  it('gives stragglers a grace period after the quorum answers', () => {
    const { source, completed } = watch(4, { quorum: 2, graceMs: 500 });
    source.next({ type: 'EVENT', from: 'a' });
    source.next({ type: 'EOSE', from: 'a' });
    vi.advanceTimersByTime(1000);
    expect(completed).not.toHaveBeenCalled();

    source.next({ type: 'EOSE', from: 'b' });
    vi.advanceTimersByTime(499);
    expect(completed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('counts CLOSED and connection errors as answered', () => {
    const { source, completed } = watch(3);
    source.next({ type: 'CLOSED', from: 'a' });
    source.next({ type: 'ERROR', from: 'b' });
    source.next({ type: 'EOSE', from: 'c' });
    expect(completed).toHaveBeenCalled();
  });

  it('ignores repeated answers from the same relay', () => {
    const { source, completed } = watch(3, { quorum: 2 });
    source.next({ type: 'EOSE', from: 'a' });
    source.next({ type: 'CLOSED', from: 'a' });
    vi.advanceTimersByTime(10_000);
    expect(completed).not.toHaveBeenCalled();
  });
});
