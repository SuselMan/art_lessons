import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { nanoid } from 'nanoid'
import type { PaperType } from '@art-lessons/shared'
import { PaperPreview } from '../../components/PaperPreview'
import { AccountNav } from '../../components/AccountNav'
import styles from './CreateRoom.module.css'

// (#211 epic, #215) MyLessons hands this off via `<Link state={{ folderId }}>`
// when "New room" is clicked while a folder is open — carried through to
// Room/index.tsx's create_room ack so the freshly created room gets filed
// into that folder immediately (see CreatorNavState.folderId there).
interface CreateRoomNavState {
  folderId?: string
}

type SizePreset = 'a4' | 'a3' | 'a2' | 'square' | '16:9' | 'custom' | 'infinite'

interface SizeOption {
  id: SizePreset
  label: string
  width: number
  height: number
}

const SIZE_OPTIONS: SizeOption[] = [
  { id: 'a4',     label: 'A4',     width: 1240, height: 1754 },
  { id: 'a3',     label: 'A3',     width: 1754, height: 2480 },
  { id: 'a2',     label: 'A2',     width: 2480, height: 3508 },
  { id: 'square', label: 'Square', width: 1500, height: 1500 },
  { id: '16:9',   label: '16:9',   width: 1920, height: 1080 },
  { id: 'custom', label: 'Custom', width: 0,    height: 0    },
]

const PAPER_OPTIONS: { type: PaperType; label: string; desc: string }[] = [
  { type: 'rough',   label: 'Rough',   desc: 'Visible grain, classic feel' },
  { type: 'smooth',  label: 'Smooth',  desc: 'Fine grain, versatile' },
  { type: 'bristol', label: 'Bristol', desc: 'Near-flat, precise lines' },
]

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
  const [paper,       setPaper]       = useState<PaperType>('rough')
  const [sizePreset,  setSizePreset]  = useState<SizePreset>('a4')
  const [customW,     setCustomW]     = useState('1920')
  const [customH,     setCustomH]     = useState('1080')
  const [usePassword, setUsePassword] = useState(false)
  const [password,    setPassword]    = useState('')
  const [error,       setError]       = useState<string | null>(null)

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
      navigate(`/room/${id}`, { state: { room: { id, name, paper, infinite: true }, password: pw, folderId } })
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
      width  = preset.width
      height = preset.height
    }

    navigate(`/room/${id}`, {
      state: {
        room: { id, name, paper, infinite: false, canvasWidth: width, canvasHeight: height },
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
          <div className={styles.label}>Paper texture — fixed after creation</div>
          <div className={styles.paperCards}>
            {PAPER_OPTIONS.map(({ type, label, desc }) => (
              <div
                key={type}
                className={clsx(styles.paperCard, paper === type && styles.selected)}
                onClick={() => setPaper(type)}
              >
                <div className={styles.paperPreviewWrap}>
                  <PaperPreview type={type} width={200} height={150} />
                </div>
                <div className={styles.paperInfo}>
                  <div className={styles.paperName}>{label}</div>
                  <div className={styles.paperDesc}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas size */}
        <div className={styles.section}>
          <div className={styles.label}>Canvas size</div>
          <div className={styles.sizeCards}>
            {SIZE_OPTIONS.map(opt => (
              <div
                key={opt.id}
                className={clsx(styles.sizeCard, sizePreset === opt.id && styles.selected)}
                onClick={() => setSizePreset(opt.id)}
              >
                {opt.id !== 'custom' ? (
                  <SizeIcon width={opt.width} height={opt.height} />
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
                  <div className={styles.sizeDims}>{opt.width} × {opt.height}</div>
                )}
              </div>
            ))}
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
