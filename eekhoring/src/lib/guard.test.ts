import { createGuard } from './guard';

test('second run while the first is pending is ignored', async () => {
  const guard = createGuard(() => {});
  let calls = 0;
  let finish!: () => void;
  const first = guard.run(() => new Promise<void>((r) => { calls++; finish = r; }));
  await guard.run(async () => { calls++; });
  finish();
  await first;
  expect(calls).toBe(1);
});

test('errors go to onError and unlock the guard', async () => {
  const errors: unknown[] = [];
  const guard = createGuard((e) => errors.push(e));
  await guard.run(async () => { throw new Error('disk full'); });
  let ranAgain = false;
  await guard.run(async () => { ranAgain = true; });
  expect(errors).toEqual([new Error('disk full')]);
  expect(ranAgain).toBe(true);
});
