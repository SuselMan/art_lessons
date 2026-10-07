/** Explicit QA stand opt-in survives create/join navigation; production stays off. */
export function joinedTouchQaEnabled(dev: boolean, standOptIn: unknown, search: string): boolean {
  return dev && (standOptIn === '1' || new URLSearchParams(search).get('qaJoinedTouch') === '1')
}
