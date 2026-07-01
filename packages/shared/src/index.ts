// Layers

export interface RasterLayer {
  kind: 'layer'
  id: string
  name: string
  opacity: number   // 0–1
  visible: boolean
  locked?: boolean
}

export interface LayerFolder {
  kind: 'folder'
  id: string
  name: string
  opacity: number
  visible: boolean
  collapsed: boolean
  locked?: boolean
  children: string[]  // ordered ids, top→bottom
}

export type LayerItem = RasterLayer | LayerFolder

export interface LayerState {
  items: Record<string, LayerItem>
  rootOrder: string[]    // top→bottom; index 0 = topmost layer
  activeId: string
  selectedIds: string[]
}

export const BACKGROUND_LAYER_ID = 'background'

// Room

export type PaperType = 'rough' | 'smooth' | 'bristol'

export type CanvasSize = {
  width: number
  height: number
  label: string // 'A4' | 'A3' | 'A2' | 'Square' | '16:9' | 'Custom'
}

export type Room = {
  id: string
  name: string
  paper: PaperType
  canvasWidth: number
  canvasHeight: number
  hasPassword: boolean
  ownerId: string
  createdAt: string
}

// Users & roles

export type UserRole = 'FREE_TEACHER' | 'PRO_TEACHER' | 'ADMIN'
export type ParticipantRole = 'teacher' | 'student'

export type Participant = {
  userId: string
  name: string
  role: ParticipantRole
  color: string // cursor color
}

// Operations (drawing actions — serializable, replayable)

export type ToolType = 'pencil' | 'eraser' | 'smudge'

export type Dab = {
  x: number
  y: number
  pressure: number
  tiltX: number
  tiltY: number
  size: number
  aspectRatio: number
  angle: number
}

export type StrokeOperation = {
  id: string
  type: 'stroke'
  userId: string
  layerId: string
  tool: ToolType
  preset: string        // 'HB', '2B' etc — for pencil
  dabs: Dab[]
  timestamp: number
}

export type LayerAddOperation = {
  id: string
  type: 'layer_add'
  userId: string
  layerId: string
  name: string
  above: string | null  // layerId to insert above, null = bottom
  timestamp: number
}

export type LayerDeleteOperation = {
  id: string
  type: 'layer_delete'
  userId: string
  layerId: string
  timestamp: number
}

export type LayerReorderOperation = {
  id: string
  type: 'layer_reorder'
  userId: string
  layerIds: string[]    // full ordered list
  timestamp: number
}

export type LayerOpacityOperation = {
  id: string
  type: 'layer_opacity'
  userId: string
  layerId: string
  opacity: number       // 0–1
  timestamp: number
}

export type Operation =
  | StrokeOperation
  | LayerAddOperation
  | LayerDeleteOperation
  | LayerReorderOperation
  | LayerOpacityOperation

// Socket events

export type ServerToClientEvents = {
  room_state: (state: { operations: Operation[]; participants: Participant[] }) => void
  peer_operation: (op: Operation) => void
  peer_cursor: (data: { userId: string; x: number; y: number }) => void
  peer_joined: (participant: Participant) => void
  peer_left: (userId: string) => void
}

export type ClientToServerEvents = {
  join_room: (data: { roomId: string; password?: string; name: string }) => void
  operation: (op: Operation) => void
  cursor_move: (data: { x: number; y: number }) => void
}

// Hotkeys

export type HotkeyAction =
  | 'brush' | 'eraser' | 'smudge'
  | 'undo' | 'redo'
  | 'zoomIn' | 'zoomOut' | 'resetView'
  | 'layerNext' | 'layerPrev'
  | 'sizeIncrease' | 'sizeDecrease'

export const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  brush:        'b',
  eraser:       'e',
  smudge:       'r',
  undo:         'ctrl+z',
  redo:         'ctrl+shift+z',
  zoomIn:       '=',
  zoomOut:      '-',
  resetView:    '0',
  layerNext:    ']',
  layerPrev:    '[',
  sizeIncrease: 'shift+]',
  sizeDecrease: 'shift+[',
}
