export function uid(): string {
  const b = new Uint8Array(8)
  crypto.getRandomValues(b)
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
}
