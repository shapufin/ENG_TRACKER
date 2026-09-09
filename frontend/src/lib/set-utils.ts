export const toggleSetItem = <T>(prev: Set<T>, id: T): Set<T> => {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};
