import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { nanoid } from 'nanoid'
import {
  DEFAULT_PAPER_COLORS, PAPER_CHARACTER, PAPER_CHARACTER_LABELS, PAPER_COARSENESS,
  PAPER_COARSENESS_LABELS, paperCharacterOf, paperCoarsenessOf,
  type PaperCharacter, type PaperCoarseness, type PaperType,
} from '@art-lessons/shared'
import { hexToRgb, rgbToHex } from '../../lib/color'
import { PaperPreview } from '../../components/PaperPreview'
import { AccountNav } from '../../components/AccountNav'
import { ColorPicker } from '../../components/ColorPicker'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import styles from './CreateRoom.module.css'

// (#211 epic, #215) MyLessons hands this off via `<Link state={{ folderId }}>`
// when "New room" is clicked while a folder is open — carried through to
// Room/index.tsx's create_room ack so the freshly created room gets filed
// into that folder immediately (see CreatorNavState.folderId there).
interface CreateRoomNavState {
  folderId?: string
}

type SizePreset = 'a4' | 'a3' | 'a2' | 'square' | '16:9' | 'custom' | 'infinite'

type Orientation = 'portrait' | 'landscape'

interface SizeOption {
  id: SizePreset
  label: string
  width: number
  height: number
  // Clicking an already-selected rotatable card flips the orientation
  // (see handleSizeClick). Only the paper formats rotate: Square is a no-op
  // at 1:1, "16:9" would have to relabel itself to stay honest, and Custom
  // takes explicit width/height from the creator anyway.
  rotatable?: boolean
}

const SIZE_OPTIONS: SizeOption[] = [
  { id: 'a4',     label: 'A4',     width: 1240, height: 1754, rotatable: true },
  { id: 'a3',     label: 'A3',     width: 1754, height: 2480, rotatable: true },
  { id: 'a2',     label: 'A2',     width: 2480, height: 3508, rotatable: true },
  { id: 'square', label: 'Square', width: 1500, height: 1500 },
  { id: '16:9',   label: '16:9',   width: 1920, height: 1080 },
  { id: 'custom', label: 'Custom', width: 0,    height: 0    },
]

// Presets above are stored portrait (width < height); landscape swaps them.
// Orientation is one global value rather than per-card state, so a creator who
// picked landscape A4 and then switches to A3 gets landscape A3 — the choice
// follows them across formats instead of resetting on every click.
function resolveSize(opt: SizeOption, orientation: Orientation): { width: number; height: number } {
  if (!opt.rotatable || orientation === 'portrait') return { width: opt.width, height: opt.height }
  return { width: opt.height, height: opt.width }
}

// (#300) The picker no longer hardcodes a list — papers are a grid now
// (coarseness x fibre character, see PAPER_TYPES in shared), and the point
// of the grid is that it grows. Three are shown inline; the rest live behind
// "Show all", because a room's paper is a one-time decision that does not
// deserve a wall of twelve cards up front.
const COARSENESS_DESC: Record<PaperCoarseness, string> = {
  coarse: 'Strong tooth',
  medium: 'Moderate tooth',
  fine:   'Barely any tooth',
}

const CHARACTER_DESC: Record<PaperCharacter, string> = {
  fbm:      'Even, uniform grain',
  capsules: 'Visible cellulose fibres',
  streak:   'Laid, horizontal grain',
}

/** Flat sits in the coarseness row rather than off on its own: it has no
 *  grain to be coarse or fine about, but perceptually it *is* that axis's
 *  end stop, so the row reads as "how much tooth — strong / moderate /
 *  barely / none". Picking it skips the texture step entirely, because
 *  there is no character to choose. */
const COARSENESS_ROW: readonly (PaperCoarseness | 'flat')[] = [...PAPER_COARSENESS, 'flat']


/** One card in either row. Deliberately a <button> rather than the bare div
 *  this used to be — the picker is a real choice and has to be reachable
 *  from the keyboard. */
function PaperCard({ type, label, desc, selected, bgColorHex, onSelect }: {
  type: PaperType
  label: string
  desc: string
  selected: boolean
  bgColorHex: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={clsx(styles.paperCard, selected && styles.selected)}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <div className={styles.paperPreviewWrap}>
        <PaperPreview type={type} bgColorHex={bgColorHex} />
      </div>
      <div className={styles.paperInfo}>
        <div className={styles.paperName}>{label}</div>
        <div className={styles.paperDesc}>{desc}</div>
      </div>
    </button>
  )
}

function SizeIcon({ width, height }: { width: number; height: number }) {
  const BOX = 38
  const aspect = width / height
  let rw: number, rh: number
  if (aspect >= 1) { rw = BOX; rh = Math.round(BOX / aspect) }
  else             { rh = BOX; rw = Math.round(BOX * aspect) }
  return (
    <div className={styles.sizeIconWrap}>
      <div className={styles.sizeRect} style={{ width: rw, height: rh }} />
    </div>
  )
}

export function CreateRoom() {
  const navigate = useNavigate()
  const location = useLocation()
  const { folderId } = (location.state as CreateRoomNavState | undefined) ?? {}
  const [roomName,    setRoomName]    = useState('')
  const [paper,       setPaper]       = useState<PaperType>('coarse-streak')
  // null = "follow the selected texture's own default" (DEFAULT_PAPER_COLORS
  // below); becomes a concrete RGB the moment the creator touches the picker,
  // and from then on stays fixed regardless of which texture card is picked.
  const [paperColor,  setPaperColor]  = useState<[number, number, number] | null>(null)
  const [paperModalOpen, setPaperModalOpen] = useState(false)
  // Remembered across a trip through Flat and back: Flat carries no
  // character, so without this, choosing it would silently reset the fibre
  // pick to a default the user never made.
  const [lastCharacter, setLastCharacter] = useState<PaperCharacter>('streak')

  const selectedCoarseness = paperCoarsenessOf(paper)
  const selectedCharacter = paperCharacterOf(paper) ?? lastCharacter

  // Each coarseness card previews the character currently chosen, so
  // switching coarseness keeps the fibre and the card shows what you will
  // actually get rather than an arbitrary representative.
  const coarsenessCardType = (row: PaperCoarseness | 'flat'): PaperType =>
    row === 'flat' ? 'flat' : `${row}-${selectedCharacter}` as PaperType
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const [sizePreset,  setSizePreset]  = useState<SizePreset>('a4')
  const [orientation, setOrientation] = useState<Orientation>('portrait')
  const [customW,     setCustomW]     = useState('1920')
  const [customH,     setCustomH]     = useState('1080')
  const [usePassword, setUsePassword] = useState(false)
  const [password,    setPassword]    = useState('')
  const [error,       setError]       = useState<string | null>(null)

  const resolvedPaperColorHex = paperColor ? rgbToHex(paperColor) : DEFAULT_PAPER_COLORS[paper]

  // Same outside-click/Escape close as CardMenu (components/CardMenu) —
  // kept local rather than shared since this is the only other popover in
  // the app right now; extract a shared hook if a third one shows up.
  useEffect(() => {
    if (!colorPickerOpen) return
    function onPointerDown(e: PointerEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) setColorPickerOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setColorPickerOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [colorPickerOpen])

  function toggleOrientation() {
    setOrientation(o => (o === 'portrait' ? 'landscape' : 'portrait'))
  }

  // First click selects; clicking the already-selected card rotates it. The
  // rotate badge on the selected card is what makes that second click
  // discoverable — it fires this same toggle.
  function handleSizeClick(opt: SizeOption) {
    if (sizePreset === opt.id && opt.rotatable) {
      toggleOrientation()
      return
    }
    setSizePreset(opt.id)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const name = roomName.trim() || 'Untitled'

    const id = nanoid(8)
    // Handed to Room via navigation state (not localStorage) so it reaches
    // only this tab/browser — a joiner opening the same room link on another
    // device has no creator state and goes through the join gate instead.
    const pw = usePassword && password ? password : undefined

    if (sizePreset === 'infinite') {
      navigate(`/room/${id}`, {
        state: { room: { id, name, paper, paperColor: resolvedPaperColorHex, infinite: true }, password: pw, folderId },
      })
      return
    }

    let width: number, height: number
    if (sizePreset === 'custom') {
      width  = parseInt(customW)
      height = parseInt(customH)
      if (!width || !height || width < 100 || height < 100 || width > 4096 || height > 4096) {
        setError('Custom size must be between 100 and 4096 pixels')
        return
      }
    } else {
      const preset = SIZE_OPTIONS.find(s => s.id === sizePreset)!
      const resolved = resolveSize(preset, orientation)
      width  = resolved.width
      height = resolved.height
    }

    navigate(`/room/${id}`, {
      state: {
        room: { id, name, paper, paperColor: resolvedPaperColorHex, infinite: false, canvasWidth: width, canvasHeight: height },
        password: pw,
        folderId,
      },
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.logo}>Art Lessons</div>
        <AccountNav />
      </div>

      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        <h1 className={styles.heading}>Create a room</h1>

        {/* Room name */}
        <div className={styles.section}>
          <div className={styles.label}>Room name (optional)</div>
          <input
            className={styles.input}
            type="text"
            placeholder="Untitled"
            maxLength={50}
            value={roomName}
            onChange={e => setRoomName(e.target.value)}
          />
        </div>

        {/* Paper texture */}
        <div className={styles.section}>
          <div className={styles.paperSectionHeader}>
            <div className={styles.label}>Paper texture — fixed after creation</div>
            <div className={styles.colorPickerAnchor} ref={colorPickerRef}>
              <button
                type="button"
                className={styles.colorSwatchTrigger}
                style={{ background: resolvedPaperColorHex }}
                aria-label="Paper color"
                aria-haspopup="dialog"
                aria-expanded={colorPickerOpen}
                onClick={() => setColorPickerOpen(o => !o)}
              />
              {colorPickerOpen && (
                <div className={styles.colorPopover} onClick={e => e.stopPropagation()}>
                  <ColorPicker
                    value={paperColor ?? hexToRgb(DEFAULT_PAPER_COLORS[paper])}
                    onChange={setPaperColor}
                  />
                  {paperColor && (
                    <button type="button" className={styles.colorReset} onClick={() => setPaperColor(null)}>
                      Use default
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Row one: how much tooth. Flat is the end stop of this axis. */}
          <div className={styles.paperCards}>
            {COARSENESS_ROW.map(row => {
              const type = coarsenessCardType(row)
              return (
                <PaperCard
                  key={row}
                  type={type}
                  label={row === 'flat' ? 'Flat' : PAPER_COARSENESS_LABELS[row]}
                  desc={row === 'flat' ? 'No tooth at all' : COARSENESS_DESC[row]}
                  selected={row === 'flat' ? paper === 'flat' : selectedCoarseness === row}
                  bgColorHex={resolvedPaperColorHex}
                  onSelect={() => setPaper(type)}
                />
              )
            })}
          </div>

          {/* Row two lives behind a modal: the character axis is the one
              expected to grow, so it is the one that shouldn't have to fit
              on this page forever. Flat has no characters, so there is
              nothing to open. */}
          {paper !== 'flat' && (
            <button type="button" className={styles.showAllPapers} onClick={() => setPaperModalOpen(true)}>
              Choose texture — {PAPER_CHARACTER_LABELS[selectedCharacter]}
            </button>
          )}
        </div>

        {paperModalOpen && selectedCoarseness && (
          <Modal
            size="lg"
            title={`Texture — ${PAPER_COARSENESS_LABELS[selectedCoarseness].toLowerCase()} grain`}
            onClose={() => setPaperModalOpen(false)}
          >
            {/* Only the chosen coarseness: showing all ten at once made the
                two axes read as one flat list of near-identical cards. */}
            <div className={styles.paperModalGrid}>
              {PAPER_CHARACTER.map(character => {
                const type = `${selectedCoarseness}-${character}` as PaperType
                return (
                  <PaperCard
                    key={character}
                    type={type}
                    label={PAPER_CHARACTER_LABELS[character]}
                    desc={CHARACTER_DESC[character]}
                    selected={paper === type}
                    bgColorHex={resolvedPaperColorHex}
                    onSelect={() => {
                      setPaper(type)
                      setLastCharacter(character)
                      setPaperModalOpen(false)
                    }}
                  />
                )
              })}
            </div>
          </Modal>
        )}

        {/* Canvas size */}
        <div className={styles.section}>
          <div className={styles.label}>Canvas size</div>
          <div className={styles.sizeCards}>
            {SIZE_OPTIONS.map(opt => {
              const { width, height } = resolveSize(opt, orientation)
              const selected = sizePreset === opt.id
              return (
              <div
                key={opt.id}
                className={clsx(styles.sizeCard, selected && styles.selected)}
                onClick={() => handleSizeClick(opt)}
              >
                {selected && opt.rotatable && (
                  // Duplicates the card's own second-click toggle on purpose:
                  // the gesture is the shortcut, this is the thing that tells
                  // you the gesture exists (and gives it a keyboard path).
                  <button
                    type="button"
                    className={styles.rotateBadge}
                    title={orientation === 'portrait' ? 'Rotate to landscape' : 'Rotate to portrait'}
                    aria-label={orientation === 'portrait' ? 'Rotate to landscape' : 'Rotate to portrait'}
                    onClick={e => { e.stopPropagation(); toggleOrientation() }}
                  >
                    <Icon name="rotate_90_degrees_cw" />
                  </button>
                )}
                {opt.id !== 'custom' ? (
                  <SizeIcon width={width} height={height} />
                ) : (
                  <div className={styles.sizeIconWrap}>
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="2" y="2" width="10" height="10" rx="1" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" fill="none"/>
                      <rect x="16" y="2" width="10" height="10" rx="1" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" fill="none"/>
                      <rect x="2" y="16" width="10" height="10" rx="1" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" fill="none"/>
                      <rect x="16" y="16" width="10" height="10" rx="1" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 2" fill="none"/>
                    </svg>
                  </div>
                )}
                <div className={styles.sizeName}>{opt.label}</div>
                {opt.id !== 'custom' && (
                  <div className={styles.sizeDims}>{width} × {height}</div>
                )}
              </div>
              )
            })}
            <div
              key="infinite"
              className={clsx(styles.sizeCard, sizePreset === 'infinite' && styles.selected)}
              onClick={() => setSizePreset('infinite')}
            >
              <div className={styles.sizeIconWrap}>
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M8 14c0-2.5 1.8-4.5 4-4.5s3 2 4 4.5s2 4.5 4 4.5s4-2 4-4.5s-1.8-4.5-4-4.5s-3 2-4 4.5s-2 4.5-4 4.5s-4-2-4-4.5Z"
                    stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" fill="none"
                  />
                </svg>
              </div>
              <div className={styles.sizeName}>Infinite</div>
              <div className={styles.sizeDims}>No fixed size</div>
            </div>
          </div>

          {sizePreset === 'custom' && (
            <div className={styles.customRow}>
              <input
                className={styles.input}
                type="number"
                min={100}
                max={4096}
                placeholder="Width"
                value={customW}
                onChange={e => setCustomW(e.target.value)}
              />
              <span className={styles.customSep}>×</span>
              <input
                className={styles.input}
                type="number"
                min={100}
                max={4096}
                placeholder="Height"
                value={customH}
                onChange={e => setCustomH(e.target.value)}
              />
              <span className={styles.customUnit}>px</span>
            </div>
          )}
        </div>

        {/* Password */}
        <div className={styles.section}>
          <div className={styles.label}>Access</div>
          <label className={styles.toggleRow}>
            <div className={clsx(styles.toggle, usePassword && styles.toggleOn)}>
              <div className={clsx(styles.toggleThumb, usePassword && styles.toggleThumbOn)} />
            </div>
            <span className={styles.toggleLabel}>
              {usePassword ? 'Password protected' : 'Open — anyone with the link can join'}
            </span>
            <input
              type="checkbox"
              checked={usePassword}
              onChange={e => setUsePassword(e.target.checked)}
              style={{ display: 'none' }}
            />
          </label>
          {usePassword && (
            <input
              className={styles.input}
              type="password"
              placeholder="Room password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button type="submit" className={styles.submit}>
          Create room
        </button>
      </form>
    </div>
  )
}
