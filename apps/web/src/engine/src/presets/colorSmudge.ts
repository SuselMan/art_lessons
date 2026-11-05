/** Independent rate model for Krita's mask Color Smudge strategy.
 * Reference: KDE/krita bd6e8d0, KisColorSmudgeStrategyBase/MaskLegacy.
 * Legacy descriptors keep their existing composition and byte rounding. */
export function colorSmudgeRates(opacity: number, pickup: number, color: number, dulling: boolean) {
  const unit = (n: number): number => Math.max(0, Math.min(1, n))
  return {
    smear: unit(opacity * pickup * (dulling ? .8 : 1)),
    color: unit(color * color * opacity),
  }
}
