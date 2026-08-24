import { RadialDial } from '../../components/RadialDial'
import { useRoomStore } from '../../stores/roomStore'
import { useT } from '../../i18n'
import { PANEL_SIZE, measureFloatingPanelCenter, type PanelPosition } from './panelPosition'
import { formatDegreesMinutes, type UiToolId } from './toolSchemas'

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
  // Whether either of FloatingToolPanel's fans — palette or drawing tools — is
  // currently out. Their shared ring 1 (radius PANEL_SIZE/2 + 8 + 20) lands
  // inside this dial's own hit ring (out to PANEL_SIZE/2 + 56), so the dial
  // and a fan cannot both be live at once — see the visibility rules below.
  flyoutOpen: boolean
}

/** The chisel-nib angle dial (#277/#278), orbiting FloatingToolPanel.
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
 *  while the tool in hand is wearing a chisel nib (a round one is round — an
 *  angle control would do nothing visible for it, per the schemas' own
 *  `visibleWhen`), and not during a stroke.
 *
 *  #489: "the tool in hand" rather than "the marker", now that the watercolor
 *  brush has a flat too. The test is on the settings, not on a list of tool
 *  names — a tool wearing a chisel and offering an angle is exactly the tool
 *  this dial is for, and a list would need editing again for the next one. The panel is always mounted (just
 *  opacity-0 when hidden, see FloatingToolPanel.module.css), so its DOM
 *  element is always there to measure against once those hold.
 *
 *  One rule added since: not while either of the panel's fans is open — the
 *  palette, or the drawing-tool chooser held out of its top slot. All three
 *  orbit the same panel at almost the same radius, so with a fan out the
 *  dial's ring ran straight through its items — visually tangled, and its hit
 *  ring stole the taps meant for them. A fan is the thing the user just asked
 *  for, so the dial yields to it and comes back when the fan closes. */
export function ChiselAngleDial({ panelPosition, containerRef, uiHidden, flyoutOpen }: ChiselAngleDialProps) {
  const t = useT()
  const tool = useRoomStore(s => s.tool)
  const toolSettings = useRoomStore(s => s.toolSettings)
  const setToolSetting = useRoomStore(s => s.setToolSetting)
  const strokeActive = useRoomStore(s => s.strokeActive)

  const settings = toolSettings[tool as UiToolId] as Record<string, unknown> | undefined
  const angle = settings?.angle
  // `typeof angle === 'number'` is not belt-and-braces: it is what says this
  // tool has an angle to dial at all, which is the half of the question a nib
  // name cannot answer.
  const wearsChisel = settings?.nib === 'chisel' && typeof angle === 'number'
  if (!uiHidden || strokeActive || flyoutOpen || !wearsChisel) return null

  const center = measureFloatingPanelCenter(panelPosition, containerRef)
  if (!center) return null

  return (
    <RadialDial
      center={center}
      handleRadius={PANEL_SIZE / 2 + 24}
      hitOuterRadius={PANEL_SIZE / 2 + 56}
      readoutSize={PANEL_SIZE}
      value={angle}
      onChange={v => setToolSetting(tool as UiToolId, 'angle', v)}
      formatValue={formatDegreesMinutes}
      title={t('room.nibAngle')}
    />
  )
}
