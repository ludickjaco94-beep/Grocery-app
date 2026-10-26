// Runs one async action at a time: a double-tap on Save must not write twice.
export function createGuard(onError: (e: unknown) => void) {
  let busy = false;
  return {
    async run(fn: () => Promise<void>): Promise<void> {
      if (busy) return;
      busy = true;
      try {
        await fn();
      } catch (e) {
        onError(e);
      } finally {
        busy = false;
      }
    },
  };
}
