/** Constructor-only DEV diagnostic. Does not enable joined admission, async or preview. */
export function joinedFinishDeferredQaEnabled(dev: boolean, standOptIn: string | undefined, search: string): boolean {
  return dev && (standOptIn === '1' || new URLSearchParams(search).get('qaJoinedFinishDeferred') === '1')
}
