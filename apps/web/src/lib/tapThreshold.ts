// Shared pointer-movement threshold for telling a tap/click apart from a
// drag. Extracted (#99) so useDragToAdjust and useTapToggle agree on the
// same feel instead of each hand-rolling their own constant.
export const TAP_MOVE_THRESHOLD_PX = 4
