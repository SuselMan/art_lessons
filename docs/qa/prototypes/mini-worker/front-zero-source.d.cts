/** QA-only GLSL insertion; accepts either the shader string or its TS module. */
export const FRONT_ZERO_GUARD: string
export function transformFrontZeroSource(source: string): string

export const FRONT_JUMP_ZERO_ANCHOR: string
export const FRONT_JUMP_ZERO_GUARD: string
/** Same guard and original jump RGBA; unique anchor, refuses reapplication. */
export function transformFrontJumpZeroSource(source: string): string
