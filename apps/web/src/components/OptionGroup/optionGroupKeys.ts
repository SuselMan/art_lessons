/** Keyboard navigation for OptionGroup, kept separate from the component so
 *  the wrap-around and the Home/End ends are testable without a DOM (this
 *  repo has no component-rendering test stack — see `radialDialMath.ts` for
 *  the same split).
 *
 *  Both directions are accepted for both axes: the same component renders a
 *  horizontal strip and a vertical column, and a person pressing Down on a
 *  column of preferences means the same thing as Right on a strip of tabs. */
export function nextOptionIndex(key: string, activeIndex: number, count: number): number | null {
  if (count <= 0) return null

  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (activeIndex + 1 + count) % count
    case 'ArrowLeft':
    case 'ArrowUp':
      return (activeIndex - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
