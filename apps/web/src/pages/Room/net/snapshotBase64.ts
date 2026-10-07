/** Same HTTP payload as btoa, without a per-byte chain of temporary strings.
 * The caller owns the immutable compressed snapshot throughout this promise. */
export async function snapshotBase64(bytes: Uint8Array): Promise<string> {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64
  if (native) return native.call(bytes)
  const chunks: string[] = []
  let started = performance.now()
  for (let i = 0; i < bytes.length; i += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)))
    if (i + 0x8000 < bytes.length && performance.now() - started >= 4) {
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      started = performance.now()
    }
  }
  return btoa(chunks.join(''))
}
