/** The element at `index`, failing the test loudly when it is missing (`noUncheckedIndexedAccess`). */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Expected an element at index ${index}`);
  return item;
}
