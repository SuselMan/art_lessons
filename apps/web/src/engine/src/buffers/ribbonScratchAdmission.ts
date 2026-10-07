/** Admission calculation only. It allocates nothing and never samples paint.
 * A caller must revalidate idle/epoch/context before every admitted buffer. */
export function ribbonScratchAdmission(width: number, height: number, targetCount: number,
  sameSizeFree: number, allFreeBytes: number, capBytes = 64 * 1024 * 1024): number {
  if (![width, height, targetCount, sameSizeFree, allFreeBytes, capBytes].every(Number.isFinite)) return 0
  if (![width, height, targetCount, sameSizeFree].every(Number.isInteger)) return 0
  if (width <= 0 || height <= 0 || targetCount < 0 || sameSizeFree < 0 || allFreeBytes < 0 || capBytes < 0) return 0
  const bytes = width * height * 4
  if (!Number.isSafeInteger(bytes) || sameSizeFree * bytes > allFreeBytes) return 0
  return Math.max(0, Math.min(targetCount - sameSizeFree, Math.floor((capBytes - allFreeBytes) / bytes)))
}
