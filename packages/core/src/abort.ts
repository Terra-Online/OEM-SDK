/** Stop waiting immediately even when a transport ignores AbortSignal. */
export function withOEMAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    if (signal.aborted) {
      // Consume a possible rejection from an already-started transport.
      void operation.catch(() => undefined);
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
