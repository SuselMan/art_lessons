/** (#623) Reading a request's own fields. The shared route table names them;
 *  what a client actually put there is still anybody's guess (see Untrusted
 *  in packages/shared/src/rest.ts), so a handler reads each value through one
 *  of these and decides what an absent or wrong-typed one means. */

/** The value if it is a string, otherwise undefined. */
export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** For a field where `null` is meaningful (clear it) and absence is too
 *  (leave it alone): `{ value }` for either of those or a string, and `null`
 *  for anything else, which the handler answers with a 400. */
export function readNullableString(value: unknown): { value: string | null | undefined } | null {
  if (value === undefined || value === null || typeof value === 'string') return { value }
  return null
}
