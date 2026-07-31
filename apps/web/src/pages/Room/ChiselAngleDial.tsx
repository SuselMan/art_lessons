import { RadialDial } from '../../components/RadialDial'
import { useRoomStore } from '../../stores/roomStore'
import { useT } from '../../i18n'
import { PANEL_SIZE, measureFloatingPanelCenter, type PanelPosition } from './panelPosition'
import { formatDegreesMinutes } from './toolSchemas'

interface ChiselAngleDialProps {
  // FloatingToolPanel's current position — null until this room's panel has
  // been dragged at least once, which is exactly the case
  // measureFloatingPanelCenter falls back to a DOM measurement for.
  panelPosition: PanelPosition | null
  containerRef: React.RefObject<HTMLElement | null>
  // Room's own minimal-UI flag (#99). Passed down rather than read from the
  // store because it still lives in Room's state, and it does not flip
  // per-stroke — one re-render per tap on the canvas is not what #309 was
  // about.
  uiHidden: boolean
  // Whether FloatingToolPanel's palette flyout is currently fanned out. Its
  // ring 1 (radius PANEL_SIZE/2 + 8 + 20) lands inside this dial's own hit
  // ring (out to PANEL_SIZE/2 + 56), so the two cannot both be live at once —
  // see the visibility rules below.
  paletteOpen: boolean
}

/** The marker chisel-nib angle dial (#277/#278), orbiting FloatingToolPanel.
 *
 *  Its own component rather than a block inside Room's JSX for one reason
 *  (#309): it is the only piece of chrome whose response to "a stroke is in
 *  progress" is to *disappear* rather than to stop taking touches. Blocking
 *  is a CSS concern and is driven from a `data-stroke-active` attribute on
 *  Room's root with no React involved at all (see `.strokeBlockable`);
 *  unmounting is not, and RadialDial renders a fragment, so there is no
 *  single element for CSS to hide either. So this one consumer subscribes to
 *  `strokeActive` — and being ~30 lines, re-rendering it twice per stroke
 *  costs nothing, which was emphatically not true of doing the same to Room.
 *
 *  Same shape as PeerCursors (#152): a small leaf component owning the
 *  subscription that would otherwise reconcile Room's whole tree.
 *
 *  Visibility rules, unchanged from when this lived in Room: only while the
 *  panel it orbits is itself on screen (`uiHidden`, i.e. minimal UI), only
 *  while chisel is the active marker nib (the bullet nib is round — an angle
 *  control would do nothing visible for it, per markerSchema's own
 *  visibleWhen), and not during a stroke. The panel is always mounted (just
 *  opacity-0 when hidden, see FloatingToolPanel.module.css), so its DOM
 *  element is always there to measure against once those hold.
 *
 *  One rule added since: not while the palette flyout is open either. Both
 *  orbit the same panel at almost the same radius, so with the flyout fanned
 *  out the dial's ring ran straight through the swatches — visually tangled,
 *  and its hit ring stole the drags meant for the colors. The palette is the
 *  thing the user just asked for, so the dial yields to it and comes back
 *  when the flyout closes. */
export function ChiselAngleDial({ panelPosition, containerRef, uiHidden, paletteOpen }: ChiselAngleDialProps) {
  const t = useT()
  const tool = useRoomStore(s => s.tool)
  const toolSettings = useRoomStore(s => s.toolSettings)
  const setToolSetting = useRoomStore(s => s.setToolSetting)
  const strokeActive = useRoomStore(s => s.strokeActive)

  const markerNib = toolSettings.marker.nib as string
  if (!uiHidden || strokeActive || paletteOpen || tool !== 'marker' || markerNib !== 'chisel') return null

  const center = measureFloatingPanelCenter(panelPosition, containerRef)
  if (!center) return null

  return (
    <RadialDial
      center={center}
      handleRadius={PANEL_SIZE / 2 + 24}
      hitOuterRadius={PANEL_SIZE / 2 + 56}
      readoutSize={PANEL_SIZE}
      value={toolSettings.marker.angle as number}
      onChange={v => setToolSetting('marker', 'angle', v)}
      formatValue={formatDegreesMinutes}
      title={t('room.markerAngle')}
    />
  )
}
