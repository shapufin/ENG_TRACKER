/** "1 member" / "2 members": the one shared pluralizer for UI counts. */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
