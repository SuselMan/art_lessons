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

/** How long the second tap of a minimal-UI double tap may take to arrive
 *  (#189). Android's own double-tap timeout is 300 ms and iOS sits around
 *  350 ms; 400 ms is deliberately at the generous end of that range, because
 *  the finger doing this is the *other* hand — the drawing hand is holding a
 *  stylus — and because the cost of the two halves is asymmetric: a window
 *  missed by 50 ms reads as "double tap doesn't work", while a window 100 ms
 *  too long costs nothing (two unrelated stray touches still have to land
 *  within a finger's width of each other to pair up). */
export const DOUBLE_TAP_MAX_DELAY_MS = 400

/** How far apart the two taps of a double tap may land. About a fingertip's
 *  width, in the same ballpark as Android's own double-tap slop — loose
 *  enough that nobody has to aim twice, tight enough that a palm brushing one
 *  corner and a finger tapping another are not one gesture. */
export const DOUBLE_TAP_MAX_DIST_PX = 48
