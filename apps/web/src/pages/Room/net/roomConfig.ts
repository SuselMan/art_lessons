import { normalizePaperType, type LessonState, type Room as RoomEntity } from '@grafetto/shared'

import type { RoomInfo } from '../../../stores/slices/roomSlice'

// Infinite-canvas rooms (#133 Phase 1) don't have a real canvasWidth/Height
// — camera-relative tile rendering (a separate follow-up) is what actually
// makes the canvas element's own size independent of "room size". Until
// that lands, an infinite room's RoomInfo gets this placeholder finite
// size so the existing fixed-canvas-shaped rendering/viewport/pointer
// pipeline below (all written in terms of one fixed-size canvas) keeps
// working unmodified rather than needing every call site touched twice.
// Large enough that "infinite" still feels roomy for this interim state.
export const PLACEHOLDER_INFINITE_CANVAS_SIZE = 8192

export function toRoomConfig(
  room: Pick<RoomEntity, 'id' | 'name' | 'paper' | 'paperColor' | 'infinite' | 'canvasWidth' | 'canvasHeight'>
    & Partial<Pick<RoomEntity, 'closedAt' | 'accessMode' | 'enabledTools'>>,
): RoomInfo {
  return {
    id: room.id, name: room.name,
    // (#300) The wire carries whatever the database holds — including the
    // three pre-grid names. Normalising here, at the single point a room
    // enters the client, keeps every downstream consumer (engine, sound,
    // picker) free of legacy handling.
    paper: normalizePaperType(room.paper), paperColor: room.paperColor, infinite: room.infinite,
    width: room.canvasWidth ?? PLACEHOLDER_INFINITE_CANVAS_SIZE,
    height: room.canvasHeight ?? PLACEHOLDER_INFINITE_CANVAS_SIZE,
    // (#222) Optional in the Pick because the creator's own branch builds a
    // RoomInfo from navigation state, where the field cannot exist yet — a
    // room is never born closed. Every other entry point comes from
    // `room_state`, which carries it.
    closedAt: room.closedAt,
    // (#460) Optional in the Pick for the same reason `closedAt` is: on the
    // creator's branch nothing has come back from the server yet, and what
    // they picked on the create form rides in on navigation state instead.
    // The fallback is the server's own — `create_room` stores
    // 'anyone_with_link' for anything it doesn't recognise (socketHandlers.ts)
    // — so this mirrors the row that is about to exist rather than inventing
    // a second default. Every other entry point comes from `room_state`,
    // which carries the real one.
    accessMode: room.accessMode ?? 'anyone_with_link',
    // (#548) No fallback and none wanted: absent *is* the unrestricted room,
    // on the creator's branch and on every other one alike.
    enabledTools: room.enabledTools,
  }
}

/** (#176, ADR 014) The lesson's `RoomInfo`, built from whichever board's
 *  `room_state` arrived first. `config` describes the *lesson* for the whole
 *  session — its id is what the share link and every lesson-level call use,
 *  its name is the header label — and a board's row differs from the lesson's
 *  only in those two fields: paper, colour, size and the social overlay are
 *  the lesson's already (see the shared `Room.lessonId`). The lesson's own
 *  name is in the strip, under the lesson's id, at order 0. */
export function toLessonConfig(room: Parameters<typeof toRoomConfig>[0], lesson: LessonState): RoomInfo {
  const own = lesson.boards.find(b => b.id === lesson.id)
  return toRoomConfig({ ...room, id: lesson.id, name: own?.name ?? room.name })
}
