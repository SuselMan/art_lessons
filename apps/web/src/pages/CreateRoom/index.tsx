import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { nanoid } from 'nanoid'
import {
  DEFAULT_PAPER_COLORS, PAPER_COARSENESS,
  type PaperCoarseness, type PaperType, type RoomAccessMode,
} from '@grafetto/shared'
import { hexToRgb, rgbToHex } from '../../lib/color'
import { preloadRoomPage } from '../../lib/roomChunk'
import { useDismissOnOutside } from '../../lib/useDismissOnOutside'
import { useT, type TFunction, type TranslationKey } from '../../i18n'
import { PaperPreview } from '../../components/PaperPreview'
import { AppHeader } from '../../components/AppHeader'
import { OptionGroup } from '../../components/OptionGroup'
import { ColorPicker } from '../../components/ColorPicker'
import { Icon } from '../../components/Icon'
import styles from './CreateRoom.module.css'

// (#211 epic, #215) MyLessons hands this off via `<Link state={{ folderId }}>`
// when "New room" is clicked while a folder is open — carried through to
// Room/index.tsx's create_room ack so the freshly created room gets filed
// into that folder immediately (see CreatorNavState.folderId there).
interface CreateRoomNavState {
  folderId?: string
}

// (#232) Deliberately the same loose shape the server checks (see
// roomAccessRoutes.ts): this is not a claim about deliverability, it is a
// guard against a typo becoming a row nobody can ever match against. The
// server remains the authority — this copy exists so the answer arrives
// while the field is still on screen.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type SizePreset = 'a4' | 'a3' | 'a2' | 'square' | '16:9' | 'custom' | 'infinite'

type Orientation = 'portrait' | 'landscape'

interface SizeOption {
  id: SizePreset
  /** Paper format names (A4, 16:9) are international notation and stay as
   *  they are; the two options that are ordinary words carry a translation
   *  key instead (#208). */
  label?: string
  labelKey?: TranslationKey
  width: number
  height: number
  // Clicking an already-selected rotatable card flips the orientation
  // (see handleSizeClick). Only the paper formats rotate: Square is a no-op
  // at 1:1, "16:9" would have to relabel itself to stay honest, and Custom
  // takes explicit width/height from the creator anyway.
  rotatable?: boolean
}

const SIZE_OPTIONS: SizeOption[] = [
  { id: 'a4',     label: 'A4',                    width: 1240, height: 1754, rotatable: true },
  { id: 'a3',     label: 'A3',                    width: 1754, height: 2480, rotatable: true },
  { id: 'a2',     label: 'A2',                    width: 2480, height: 3508, rotatable: true },
  { id: 'square', labelKey: 'create.size.square', width: 1500, height: 1500 },
  { id: '16:9',   label: '16:9',                  width: 1920, height: 1080 },
  { id: 'custom', labelKey: 'create.size.custom', width: 0,    height: 0    },
]

function sizeOptionLabel(opt: SizeOption, t: TFunction): string {
  return opt.labelKey ? t(opt.labelKey) : opt.label ?? ''
}

// Presets above are stored portrait (width < height); landscape swaps them.
// Orientation is one global value rather than per-card state, so a creator who
// picked landscape A4 and then switches to A3 gets landscape A3 — the choice
// follows them across formats instead of resetting on every click.
function resolveSize(opt: SizeOption, orientation: Orientation): { width: number; height: number } {
  if (!opt.rotatable || orientation === 'portrait') return { width: opt.width, height: opt.height }
  return { width: opt.height, height: opt.width }
}

// (#333) One row, one axis: how much tooth. There was briefly a second
// axis — fibre character — with its own modal, back when the grain was
// procedural and another axis cost nothing; all nine of those came from the
// same synthetic noise and none read as paper. A future paper is a new
// stock, which belongs in this row, not behind a second choice.
// (#208) The picker's own vocabulary lives in the web dictionary rather than
// in `PAPER_*_LABELS` from @grafetto/shared: these are UI copy, and shared
// is the frontend/backend contract, not a home for one client's
// translations. `.grain` is the lowercase noun phrase used mid-sentence in
// the modal title — Russian can't derive it by lowercasing the standalone
// label the way English can.
const COARSENESS_KEYS: Record<PaperCoarseness | 'flat', {
  label: TranslationKey
  desc: TranslationKey
}> = {
  coarse: { label: 'paper.coarseness.coarse', desc: 'paper.coarseness.coarse.desc' },
  medium: { label: 'paper.coarseness.medium', desc: 'paper.coarseness.medium.desc' },
  fine:   { label: 'paper.coarseness.fine',   desc: 'paper.coarseness.fine.desc' },
  flat:   { label: 'paper.coarseness.flat',   desc: 'paper.coarseness.flat.desc' },
}

/** Flat sits in the row rather than off on its own: it has no grain to be
 *  coarse or fine about, but perceptually it *is* that axis's end stop, so
 *  the row reads as "how much tooth — strong / moderate / barely / none". */
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
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const { folderId } = (location.state as CreateRoomNavState | undefined) ?? {}
  const [roomName,    setRoomName]    = useState('')
  // (#426) `fine` rather than `coarse`. Keep this in step with
  // DEFAULT_LAST_PAPER in stores/settingsStore.ts — that constant exists only
  // to guess, before anything is open, which ~7.4 MB texture to start
  // downloading, and it guesses by assuming it knows this value.
  const [paper,       setPaper]       = useState<PaperType>('fine')
  // null = "follow the selected texture's own default" (DEFAULT_PAPER_COLORS
  // below); becomes a concrete RGB the moment the creator touches the picker,
  // and from then on stays fixed regardless of which texture card is picked.
  const [paperColor,  setPaperColor]  = useState<[number, number, number] | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const [sizePreset,  setSizePreset]  = useState<SizePreset>('a3')
  const [orientation, setOrientation] = useState<Orientation>('portrait')
  const [customW,     setCustomW]     = useState('1920')
  const [customH,     setCustomH]     = useState('1080')
  // (#232) Who may enter, decided here rather than only after the fact in the
  // access panel — inviting three students is part of setting a lesson up,
  // not a follow-up chore.
  const [accessMode,  setAccessMode]  = useState<RoomAccessMode>('anyone_with_link')
  // One address per line: the shape people already paste out of a class list,
  // and the only editor that needs no add/remove buttons to manage a handful
  // of them. Parsed once, on submit.
  const [inviteText,  setInviteText]  = useState('')
  const [usePassword, setUsePassword] = useState(false)
  const [password,    setPassword]    = useState('')
  const [error,       setError]       = useState<string | null>(null)
  // (#351) Set once the form has handed off to `navigate` and the page is
  // waiting to be replaced. Not a network request — creating a room is purely
  // local (see handleSubmit) — but the Room chunk still has to load, and
  // react-router keeps this page on screen for the whole of it. Without this
  // the only feedback for the click is the URL, and the button reads as dead.
  const [entering,    setEntering]    = useState(false)

  // (#351) The chunk that click will need, fetched while the creator is still
  // choosing a size — see lib/roomChunk.ts. Nothing depends on it having
  // finished; it only decides whether the wait above is seconds or nothing.
  useEffect(preloadRoomPage, [])

  const resolvedPaperColorHex = paperColor ? rgbToHex(paperColor) : DEFAULT_PAPER_COLORS[paper]

  useDismissOnOutside(colorPickerOpen, colorPickerRef, () => setColorPickerOpen(false))

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
    // A second submit would mint a second room id and navigate again, while
    // the first navigation is still resolving and this page is still on
    // screen — precisely the double-click the missing feedback invited.
    if (entering) return
    setError(null)

    const name = roomName.trim() || t('create.untitled')

    const id = nanoid(8)
    // Handed to Room via navigation state (not localStorage) so it reaches
    // only this tab/browser — a joiner opening the same room link on another
    // device has no creator state and goes through the join gate instead.
    const pw = usePassword && password ? password : undefined
    // Blank lines and stray spaces are what a pasted list is made of. The
    // server normalizes and validates each address anyway (#226) — this only
    // decides what is worth sending.
    const invites = accessMode === 'invite_only'
      ? inviteText.split('\n').map(line => line.trim()).filter(Boolean)
      : []
    // Checked here as well as on the server, and not because the server can't
    // be trusted — because it answers too late to be useful: the invites are
    // sent after the room exists and this page is gone, so a typo would
    // surface as a notice inside the editor, next to no field to fix it in.
    const badLine = invites.find(email => !EMAIL_SHAPE.test(email))
    if (badLine) {
      setError(t('create.error.invalidInvite', { email: badLine }))
      return
    }
    const access = { accessMode, invites }

    // (#436) Unreachable while the infinite card is disabled below, and kept
    // deliberately: the mode still exists end to end, only its entrance is
    // shut. Deleting this would make re-opening it a rebuild instead of a
    // one-line revert.
    if (sizePreset === 'infinite') {
      setEntering(true)
      navigate(`/room/${id}`, {
        state: {
          room: { id, name, paper, paperColor: resolvedPaperColorHex, infinite: true },
          password: pw, folderId, ...access,
        },
      })
      return
    }

    let width: number, height: number
    if (sizePreset === 'custom') {
      width  = parseInt(customW)
      height = parseInt(customH)
      if (!width || !height || width < 100 || height < 100 || width > 4096 || height > 4096) {
        setError(t('create.error.customSize'))
        return
      }
    } else {
      const preset = SIZE_OPTIONS.find(s => s.id === sizePreset)!
      const resolved = resolveSize(preset, orientation)
      width  = resolved.width
      height = resolved.height
    }

    // After the size validation above, never before it — a rejected custom
    // size leaves the form usable rather than stuck behind a disabled button.
    setEntering(true)
    navigate(`/room/${id}`, {
      state: {
        room: { id, name, paper, paperColor: resolvedPaperColorHex, infinite: false, canvasWidth: width, canvasHeight: height },
        password: pw,
        folderId,
        ...access,
      },
    })
  }

  return (
    <div className={styles.page}>
      <AppHeader />

      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        <h1 className={styles.heading}>{t('create.heading')}</h1>

        {/* Room name */}
        <div className={styles.section}>
          <div className={styles.label}>{t('create.roomName')}</div>
          <input
            className={styles.input}
            type="text"
            placeholder={t('create.untitled')}
            maxLength={50}
            value={roomName}
            onChange={e => setRoomName(e.target.value)}
          />
        </div>

        {/* Paper texture */}
        <div className={styles.section}>
          <div className={styles.paperSectionHeader}>
            <div className={styles.label}>{t('create.paperSection')}</div>
            <div className={styles.colorPickerAnchor} ref={colorPickerRef}>
              <button
                type="button"
                className={styles.colorSwatchTrigger}
                style={{ background: resolvedPaperColorHex }}
                aria-label={t('create.paperColor')}
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
                      {t('create.useDefaultColor')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* How much tooth. Flat is the end stop of this axis. */}
          <div className={styles.paperCards}>
            {COARSENESS_ROW.map(row => (
              <PaperCard
                key={row}
                type={row}
                label={t(COARSENESS_KEYS[row].label)}
                desc={t(COARSENESS_KEYS[row].desc)}
                selected={paper === row}
                bgColorHex={resolvedPaperColorHex}
                onSelect={() => setPaper(row)}
              />
            ))}
          </div>

        </div>

        {/* Canvas size */}
        <div className={styles.section}>
          <div className={styles.label}>{t('create.canvasSize')}</div>
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
                    title={t(orientation === 'portrait' ? 'create.rotateToLandscape' : 'create.rotateToPortrait')}
                    aria-label={t(orientation === 'portrait' ? 'create.rotateToLandscape' : 'create.rotateToPortrait')}
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
                <div className={styles.sizeName}>{sizeOptionLabel(opt, t)}</div>
                {opt.id !== 'custom' && (
                  <div className={styles.sizeDims}>{width} × {height}</div>
                )}
              </div>
              )
            })}
            {/* (#436) The infinite canvas isn't part of the first release, so
                the only way into the mode is closed here — the card stays on
                screen, unselectable, as an announcement rather than a hole in
                the grid. Everything downstream of it (the `infinite` preset,
                the engine's tiled mode, rooms already created that way) is
                untouched: re-opening it is deleting this block's disabled
                state, not rebuilding a feature. */}
            <div
              key="infinite"
              className={clsx(styles.sizeCard, styles.sizeCardDisabled)}
              aria-disabled="true"
              title={t('create.size.comingSoon')}
            >
              <div className={styles.sizeIconWrap}>
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M8 14c0-2.5 1.8-4.5 4-4.5s3 2 4 4.5s2 4.5 4 4.5s4-2 4-4.5s-1.8-4.5-4-4.5s-3 2-4 4.5s-2 4.5-4 4.5s-4-2-4-4.5Z"
                    stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" fill="none"
                  />
                </svg>
              </div>
              <div className={styles.sizeName}>{t('create.size.infinite')}</div>
              <div className={styles.comingSoon}>{t('create.size.comingSoon')}</div>
            </div>
          </div>

          {sizePreset === 'custom' && (
            <div className={styles.customRow}>
              <input
                className={styles.input}
                type="number"
                min={100}
                max={4096}
                placeholder={t('create.width')}
                value={customW}
                onChange={e => setCustomW(e.target.value)}
              />
              <span className={styles.customSep}>×</span>
              <input
                className={styles.input}
                type="number"
                min={100}
                max={4096}
                placeholder={t('create.height')}
                value={customH}
                onChange={e => setCustomH(e.target.value)}
              />
              <span className={styles.customUnit}>px</span>
            </div>
          )}
        </div>

        {/* Access (#232) — who may enter, and separately whether a password is
            asked. Two controls rather than one three-way choice, because the
            two are independent: an invite-only lesson can also carry a
            password, and an open one usually is the one that needs it. */}
        <div className={styles.section}>
          <div className={styles.label}>{t('create.access')}</div>
          <OptionGroup
            variant="list"
            selection="radio"
            ariaLabel={t('create.access')}
            active={accessMode}
            onSelect={setAccessMode}
            options={[
              { id: 'anyone_with_link', label: t('access.mode.anyoneWithLink') },
              { id: 'invite_only', label: t('access.mode.inviteOnly') },
            ]}
          />
          {accessMode === 'invite_only' && (
            <>
              <textarea
                className={styles.invites}
                rows={4}
                placeholder={t('create.invitesPlaceholder')}
                value={inviteText}
                onChange={e => setInviteText(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              {/* Says the two things that are not obvious: the list can wait,
                  and an invite reaches a person only once they sign in with
                  that address (roomAccess.ts's allow-list is keyed by it). */}
              <div className={styles.hint}>{t('create.invitesHint')}</div>
            </>
          )}
          <label className={styles.toggleRow}>
            <div className={clsx(styles.toggle, usePassword && styles.toggleOn)}>
              <div className={clsx(styles.toggleThumb, usePassword && styles.toggleThumbOn)} />
            </div>
            {/* (#232) One label, not two: the toggle used to double as the
                access setting, so it read "Open — anyone with the link" when
                off. That sentence now belongs to the mode above, and saying
                it twice — once as a mode, once as the off-state of a password
                switch — would make them look like the same choice. */}
            <span className={styles.toggleLabel}>{t('create.requirePassword')}</span>
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
              placeholder={t('create.roomPassword')}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button type="submit" className={styles.submit} disabled={entering}>
          {t(entering ? 'create.submitting' : 'create.submit')}
        </button>
      </form>
    </div>
  )
}
