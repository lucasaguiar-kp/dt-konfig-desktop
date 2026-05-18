const CANCEL_MESSAGE = "OTA cancelled.";

export function createCancelError(): Error {
  return new Error(CANCEL_MESSAGE);
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createCancelError();
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(createCancelError());
    };

    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
