// Shared pointer-movement threshold for telling a tap/click apart from a
// drag. Extracted (#99) so useDragToAdjust and useTapToggle agree on the
// same feel instead of each hand-rolling their own constant.
export const TAP_MOVE_THRESHOLD_PX = 4

/** How far a pointer may wander and still count as a *click* rather than a
 *  drag (#408). Deliberately looser than TAP_MOVE_THRESHOLD_PX above, because
 *  the two answer different questions.
 *
 *  4 px is the budget for a gesture that competes with the first pixel of a
 *  pan and with drawing itself: minimal UI's tap-to-hide has to lose to
 *  anything that might have been meant as a stroke or a pan, and it costs
 *  nothing to get wrong — tap again.
 *
 *  A click on the canvas past the gizmo (see Room's own effect) competes with
 *  neither, and it is mostly made with a stylus on a tablet, where a still
 *  hand is not the same thing as a still pointer: on a high-DPI digitiser
 *  4 CSS px is well under a millimetre of tip travel, so a pen tap that lands
 *  and lifts inside that budget is the exception rather than the rule. What it
 *  does have to lose to is a *pan*, which is tens of pixels long by the time
 *  anyone means it. 10 px is about the slop every platform's own click
 *  recognition allows (Android's 8dp touch slop, Chrome's own ~8 px for
 *  touch) — nowhere near a deliberate drag. */
export const CLICK_MOVE_THRESHOLD_PX = 10
