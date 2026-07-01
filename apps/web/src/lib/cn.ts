/** Lightweight classname helper — filters falsy values and joins with space. */
export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
