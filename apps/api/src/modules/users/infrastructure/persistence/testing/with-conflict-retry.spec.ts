import { TransactionConflictError } from '../../../domain/errors/transaction-conflict.error';
import { withConflictRetry } from './with-conflict-retry';

// EN-147: pins the retry branch that the integration suite never reaches
// under --runInBand (no concurrent serializable transaction there).
describe('withConflictRetry', () => {
  const recordingSleep = () => {
    const delays: number[] = [];
    const sleep = (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    };
    return { delays, sleep };
  };

  it('returns the first result without waiting when run succeeds', async () => {
    const { delays, sleep } = recordingSleep();
    const run = jest.fn().mockResolvedValue('ok');

    await expect(withConflictRetry(run, { sleep })).resolves.toBe('ok');

    expect(run).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('retries a conflict with a growing delay and returns the later result', async () => {
    const { delays, sleep } = recordingSleep();
    const run = jest
      .fn()
      .mockRejectedValueOnce(new TransactionConflictError())
      .mockRejectedValueOnce(new TransactionConflictError())
      .mockResolvedValueOnce('ok');

    await expect(withConflictRetry(run, { sleep })).resolves.toBe('ok');

    expect(run).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([25, 50]);
  });

  it('rethrows the last conflict once the attempts run out, without a final wait', async () => {
    const { delays, sleep } = recordingSleep();
    const lastConflict = new TransactionConflictError();
    const run = jest
      .fn()
      .mockRejectedValueOnce(new TransactionConflictError())
      .mockRejectedValueOnce(new TransactionConflictError())
      .mockRejectedValueOnce(lastConflict);

    await expect(withConflictRetry(run, { sleep })).rejects.toBe(lastConflict);

    expect(run).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([25, 50]);
  });

  it('rethrows a non-conflict error at once, without retrying', async () => {
    const { delays, sleep } = recordingSleep();
    const timeout = new Error('Transaction already closed (P2028)');
    const run = jest.fn().mockRejectedValue(timeout);

    await expect(withConflictRetry(run, { sleep })).rejects.toBe(timeout);

    expect(run).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });
});
