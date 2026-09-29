/** Minimal bounded-concurrency task runner. Order of results matches input order. */
export async function pool<T, R>(
  items: readonly T[],
  size: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.min(size, items.length || 1));
  const results = new Array<R>(items.length);
  let cursor = 0;
  const lanes = Array.from({ length: limit }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T, index);
    }
  });
  await Promise.all(lanes);
  return results;
}
