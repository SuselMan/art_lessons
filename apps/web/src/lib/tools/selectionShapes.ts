/** The three ways to draw a selection. Rectangle and freehand are one press
 *  and one release; the point-by-point lasso is a sequence of taps ended by
 *  closing on the first point (or by double-tapping / pressing Enter, both of
 *  which Room maps onto `closePolygonSelection` in selectionGesture.ts).
 *
 *  Here rather than in that gesture file because the tool registry offers
 *  them as the selection tool's setting, and the registry sits below the store
 *  that holds tool settings (#650). */
export const SELECTION_SHAPES = ['rectangle', 'polygon', 'freehand'] as const

export type SelectionShapeKind = (typeof SELECTION_SHAPES)[number]
