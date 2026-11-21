import { useEffect, useLayoutEffect, useState } from 'react'
import { useGlobals } from 'storybook/preview-api'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, IconButton } from '../components/Button'
import { TextInput } from '../components/TextInput'
import { Switch } from '../components/Switch'
import { PrecisionSlider } from '../components/PrecisionSlider'
import { OptionGroup } from '../components/OptionGroup'
import { OptionSelect } from '../components/OptionPicker/OptionSelect'
import { ColorPicker } from '../components/ColorPicker'
import { Badge } from '../components/Badge'
import { Notice } from '../components/Notice/Notice'
import { Modal } from '../components/Modal'
import { Tooltip } from '../components/Tooltip'
import { SidePanel } from '../components/SidePanel'
import { CardMenu } from '../components/CardMenu'
import { rgbToHex, hexToRgb } from '../lib/browser/color'
import { Logo } from '../components/Logo'
import type { IconName } from '../icons/iconNames'
import tokens from '../styles/tokens.css?raw'
import styles from './PalettePlayground.module.css'

type Theme = 'dark' | 'light'
type Drafts = Record<Theme, Record<string, string>>
const storageKey = 'grafetto.storybook.palette.v1'
const css = tokens.replace(/\/\*[\s\S]*?\*\//g, '')
function declarations(selector: string) {
  const start = css.indexOf('{', css.indexOf(selector))
  return Object.fromEntries([...css.slice(start + 1, css.indexOf('}', start)).matchAll(/(--color-[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]))
}
const dark = declarations(':root {')
const palettes = { dark, light: { ...dark, ...declarations(":root[data-theme='light']") } }
const groups = [
  { title: 'Поверхности и текст', usage: 'Фон, панели, карточки, поля и подписи', names: ['bg', 'surface', 'surface-raised', 'surface-2', 'surface-hover', 'border', 'border-soft', 'border-strong', 'text-bright', 'text', 'text-dim', 'text-faint'] },
  { title: 'Действия и контролы', usage: 'Кнопки, выделение, hover/focus, слайдеры и свитчи', names: ['accent', 'accent-hover', 'accent-active', 'accent-border', 'on-accent', 'switch-knob', 'knob', 'knob-off', 'knob-border'] },
  { title: 'Состояния', usage: 'Уведомления, ошибки, счётчики и удаление', names: ['success', 'warning', 'on-warning', 'error', 'error-fill', 'error-fill-hover'] },
  { title: 'Холст и цвет', usage: 'Рабочая область, бумага, маркер пикера и RGB-кривые', names: ['viewport-bg', 'viewport-dot', 'paper-tint', 'paper-ink', 'picker-marker', 'canvas-outline-light', 'canvas-outline-dark', 'on-peer', 'channel-red', 'channel-green', 'channel-blue'] },
  { title: 'Поверх рисунка', usage: 'Контрол на превью, его hover и фон модального окна', names: ['image-control-bg', 'image-control-text', 'image-control-hover', 'scrim'] },
]
const grouped = new Set(groups.flatMap(group => group.names.map(name => `--color-${name}`)))
const other = Object.keys(dark).filter(name => !grouped.has(name))
if (other.length) groups.push({ title: 'Новые цвета', usage: 'Добавлены в tokens.css; требуют примера использования', names: other.map(name => name.replace('--color-', '')) })
const validColor = (value: string) => CSS.supports('color', value)
function readDrafts(): Drafts {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<Drafts>
    const clean = (value: unknown) => value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([name, color]) => Object.hasOwn(dark, name) && typeof color === 'string')) : {}
    return { dark: clean(saved.dark), light: clean(saved.light) }
  } catch { return { dark: {}, light: {} } }
}
type PaletteVariant = { id: string; name: string; colors: Drafts }
const variantsKey = `${storageKey}.variants`
const snapshot = (drafts: Drafts): Drafts => ({ dark: { ...palettes.dark, ...drafts.dark }, light: { ...palettes.light, ...drafts.light } })
function readVariants(): PaletteVariant[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(variantsKey) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((value): value is PaletteVariant => !!value && typeof value.id === 'string' && typeof value.name === 'string' && value.name.trim().length > 0 && ['dark', 'light'].every(theme => value.colors?.[theme] && Object.entries(value.colors[theme]).every(([name, color]) => Object.hasOwn(dark, name) && typeof color === 'string' && validColor(color))))
  } catch { return [] }
}
function samePalette(a: Drafts, b: Drafts) {
  return (['dark', 'light'] as const).every(theme => Object.keys(dark).every(name => a[theme][name] === b[theme][name]))
}
function exportCss(drafts: Drafts) {
  return (['dark', 'light'] as const).map(theme => `${theme === 'dark' ? ':root' : ":root[data-theme='light']"} {\n${Object.entries(drafts[theme]).filter(([, value]) => validColor(value)).map(([name, value]) => `  ${name}: ${value};`).join('\n')}\n}`).join('\n\n')
}

function Workspace() {
  const [tool, setTool] = useState('brush'), [tab, setTab] = useState<string | null>('tool')
  const [opacity, setOpacity] = useState(72), [sound, setSound] = useState(true), [texture, setTexture] = useState(false)
  const [grade, setGrade] = useState('2b'), [color, setColor] = useState<[number, number, number]>(() => hexToRgb('#5555aa'))
  const [dialog, setDialog] = useState(false), [saved, setSaved] = useState(false)
  const toolSettings = <div className={styles.controls}>
    <OptionGroup selection="radio" variant="segmented" ariaLabel="Инструмент" active={tool} onSelect={setTool} options={[{ id: 'brush', label: 'Кисть' }, { id: 'pencil', label: 'Карандаш' }]} />
    <TextInput label="Название кисти" defaultValue="Graphite study" description="Настройки сохраняются в проекте" />
    <OptionSelect label="Твёрдость" value={grade} onChange={setGrade} options={[{ value: 'hb', label: 'HB' }, { value: '2b', label: '2B' }, { value: '6b', label: '6B' }]} />
    <div><div className={styles.row}><span>Интенсивность</span><span>{opacity}%</span></div><PrecisionSlider orientation="horizontal" min={0} max={100} step={1} value={opacity} onChange={setOpacity} title="Интенсивность" /></div>
    <Switch checked={sound} onChange={setSound} label="Звук рисования" />
    <Switch checked={texture} onChange={setTexture} label="Текстура" />
    <Switch checked={false} onChange={() => {}} label="Недоступная настройка" disabled />
    <TextInput label="Имя пресета" defaultValue="Graphite" error="Такой пресет уже существует" />
    <Button variant="subtle" onClick={() => setSaved(true)}>Сохранить пресет</Button>
    <Button variant="secondary" disabled>Экспорт недоступен</Button>
    <div className={styles.hint}>Последнее изменение · только что</div>
  </div>
  return <div className={styles.scene} aria-label="Пример интерфейса Grafetto">
    <header className={styles.header}><div className={styles.logo}><Logo /></div><span className={styles.project}>Натюрморт · урок 04</span><Badge>3</Badge><Button variant="secondary" onClick={() => setDialog(true)}>Поделиться</Button></header>
    <div className={styles.editor}>
      <div className={styles.rail}>{(['brush', 'edit', 'ink_eraser', 'pan_tool', 'undo', 'redo'] as IconName[]).map((icon, i) => <Tooltip key={icon} content={['Кисть', 'Карандаш', 'Ластик', 'Перемещение', 'Отменить', 'Повторить'][i]}><IconButton icon={icon} variant="ghost" aria-label={icon} aria-pressed={i < 2 ? tool === (i ? 'pencil' : 'brush') : undefined} onClick={() => i < 2 && setTool(i ? 'pencil' : 'brush')} /></Tooltip>)}</div>
      <div className={styles.viewport}>
        <div className={styles.paper}>
          <svg viewBox="0 0 400 430" role="img" aria-label="Учебный рисунок вазы">
            <g fill="none" stroke="var(--color-paper-ink)" strokeWidth="1.5" opacity=".65"><path d="M137 112 Q200 102 263 112 L253 165 Q299 212 280 304 Q272 330 200 333 Q128 330 120 304 Q101 212 147 165Z"/><ellipse cx="200" cy="112" rx="63" ry="11"/><path d="M146 166Q200 181 254 165M123 300Q200 325 279 300M150 170Q123 255 141 304M158 177Q135 250 151 312M165 180Q149 260 162 317M171 186Q159 258 174 320M182 187Q176 268 188 321M200 190Q195 277 202 323M216 188Q214 278 216 322M232 182Q235 266 228 320M249 180Q263 258 242 314M265 201Q282 265 252 310"/><path d="M78 345Q200 365 328 342M94 355Q205 375 315 353" opacity=".35"/></g>
          </svg>
          <span className={styles.cursor} /><span className={styles.peer}>Илья</span>
          <span className={styles.selection} />
        </div>
        <div className={styles.canvasFooter}><Badge tone="warning">3</Badge><span>Ожидают входа</span><Button variant="secondary" size="sm" onClick={() => setTab('people')}>Показать</Button></div>
      </div>
      <SidePanel tabs={[{ id: 'tool', icon: 'brush', title: 'Инструмент', content: toolSettings }, { id: 'color', icon: 'palette', title: 'Цвет', content: <ColorPicker value={color} onChange={setColor} mode="ring" /> }, { id: 'people', icon: 'group', title: 'Участники', badge: 3, badgeLabel: '3 запроса', content: <div className={styles.controls}><TextInput label="Пригласить" placeholder="Email ученика" /><Button>Пригласить</Button><Button variant="danger">Удалить участника</Button></div> }]} active={tab} onSelect={setTab} />
    </div>
    <div className={styles.samples}>
      <div className={styles.card}><h3>Цвет и каналы</h3><div className={styles.picker}><ColorPicker value={color} onChange={setColor} mode="bar" /><svg viewBox="0 0 160 120" className={styles.curves} aria-label="RGB-кривые"><path d="M4 116H156M4 4V116" stroke="var(--color-border-strong)" fill="none" />{['red', 'green', 'blue'].map((channel, i) => <path key={channel} d={`M4 116Q${42 + i * 30} ${20 + i * 20} 156 4`} fill="none" stroke={`var(--color-channel-${channel})`} strokeWidth="2" />)}</svg></div></div>
      <div className={styles.card}><h3>Состояния проекта</h3><div className={styles.notices}><Notice variant="success" message={saved ? 'Пресет сохранён' : 'Все изменения сохранены'} /><Notice variant="warning" message="Соединение нестабильно" /><Notice variant="error" message="Не удалось загрузить кисть" action={{ label: 'Повторить', onClick: () => setSaved(true) }} /><Notice variant="neutral" message="Холст доступен только для просмотра" /></div><div className={styles.row}><Button variant="ghost">Отмена</Button><Button variant="danger" onClick={() => setDialog(true)}>Удалить проект</Button></div></div>
      <div className={styles.card}><h3>Контрол поверх рисунка</h3><div className={styles.imagePreview}><svg viewBox="0 0 320 120" aria-hidden="true"><path d="M-20 100Q50 -20 150 80T340 15" fill="none" stroke="var(--color-paper-ink)" strokeWidth="42" opacity=".55" /></svg><div className={styles.imageAction}><CardMenu actions={[{ label: 'Настройки проекта', icon: 'edit', onClick: () => setDialog(true) }, { label: 'Удалить', icon: 'delete', danger: true, onClick: () => setDialog(true) }]} /></div></div><p className={styles.hint}>Фиксированный контраст поверх любого изображения</p><Button onClick={() => setDialog(true)}>Открыть модальное окно</Button></div>
    </div>
    {dialog && <Modal title="Настройки проекта" onClose={() => setDialog(false)}><div className={styles.dialog}><TextInput label="Название проекта" defaultValue="Натюрморт · урок 04" /><TextInput label="Ссылка для учеников" defaultValue="grafetto.com/room/example" readOnly /><Notice variant="warning" message="Удаление нельзя отменить" /><div className={styles.row}><Button variant="secondary" onClick={() => setDialog(false)}>Отмена</Button><Button onClick={() => { setSaved(true); setDialog(false) }}>Сохранить</Button></div></div></Modal>}
  </div>
}

function Playground({ theme, onThemeChange }: { theme: Theme; onThemeChange: (theme: Theme) => void }) {
  const [picked, setPicked] = useState<{ name: string; rgb: [number, number, number]; alpha: number } | null>(null)
  const [drafts, setDrafts] = useState<Drafts>(readDrafts), [filter, setFilter] = useState(''), [copied, setCopied] = useState(false)
  const [variants, setVariants] = useState<PaletteVariant[]>(readVariants)
  const [savingVariant, setSavingVariant] = useState(false), [variantName, setVariantName] = useState('')
  const [storageError, setStorageError] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const [preferredVariant, setPreferredVariant] = useState('')
  const current = snapshot(drafts)
  const preferredColors = preferredVariant === 'original' ? palettes : variants.find(variant => variant.id === preferredVariant)?.colors
  const selectedVariant = preferredColors && samePalette(snapshot(preferredColors), current) ? preferredVariant : variants.find(variant => samePalette(snapshot(variant.colors), current))?.id ?? (samePalette(palettes, current) ? 'original' : 'custom')
  const selectVariant = (id: string) => {
    const colors = id === 'original' ? palettes : variants.find(variant => variant.id === id)?.colors
    if (!colors) return
    const overrides = (theme: Theme) => Object.fromEntries(Object.entries(colors[theme]).filter(([name, value]) => value !== palettes[theme][name]))
    setDrafts({ dark: overrides('dark'), light: overrides('light') }); setPreferredVariant(id); setCopied(false); setPicked(null)
  }
  const deleteVariant = () => {
    if (!variants.some(variant => variant.id === selectedVariant)) return
    const next = variants.filter(variant => variant.id !== selectedVariant)
    try {
      localStorage.setItem(variantsKey, JSON.stringify(next))
      setVariants(next); setPreferredVariant(''); setDeleteError(false)
    } catch { setDeleteError(true) }
  }
  const saveVariant = () => {
    if (!variantName.trim() || invalid) return
    const next = [...variants, { id: crypto.randomUUID(), name: variantName.trim(), colors: snapshot(drafts) }]
    try { localStorage.setItem(variantsKey, JSON.stringify(next)); setVariants(next); setPreferredVariant(next[next.length - 1].id); setSavingVariant(false); setStorageError(false) }
    catch { setStorageError(true) }
  }
  const draft = drafts[theme]
  useEffect(() => { setPicked(null) }, [theme])
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(drafts)) } catch { /* Preview still works without storage. */ } }, [drafts])
  useLayoutEffect(() => {
    const root = document.documentElement
    const previous = Object.keys(draft).map(name => [name, root.style.getPropertyValue(name), root.style.getPropertyPriority(name)])
    for (const [name, value] of Object.entries(draft)) if (validColor(value)) root.style.setProperty(name, value)
    return () => { for (const [name, value, priority] of previous) { if (value) root.style.setProperty(name, value, priority); else root.style.removeProperty(name) } }
  }, [draft])
  const count = Object.keys(draft).length
  const invalid = Object.values(drafts).some(values => Object.values(values).some(value => !validColor(value)))
  const edit = (name: string, value: string) => { setCopied(false); setDrafts(current => ({ ...current, [theme]: { ...current[theme], [name]: value } })) }
  const download = () => {
    const content = exportCss({ dark: { ...palettes.dark, ...drafts.dark }, light: { ...palettes.light, ...drafts.light } })
    const url = URL.createObjectURL(new Blob([content + '\n'], { type: 'text/css;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'grafetto-palette.css'
    document.body.append(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const pick = (name: string, background: string) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')
    if (!context) return
    context.fillStyle = background; context.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
    setPicked({ name, rgb: [r / 255, g / 255, b / 255], alpha: a / 255 })
  }
  const changePicked = (rgb: [number, number, number], alpha: number) => {
    if (!picked) return
    setPicked({ ...picked, rgb, alpha })
    edit(picked.name, alpha === 1 ? rgbToHex(rgb) : `rgba(${rgb.map(value => Math.round(value * 255)).join(', ')}, ${Number(alpha.toFixed(3))})`)
  }
  return <main className={styles.page} data-palette-playground>
    <div className={styles.top}><div><h1>Палитра в интерфейсе</h1><p>Живые компоненты Grafetto. Наводи, переключай, открывай меню и окна.</p></div><OptionGroup variant="segmented" selection="radio" ariaLabel="Тема палитры" active={theme} onSelect={value => onThemeChange(value === 'light' ? 'light' : 'dark')} options={[{ id: 'dark', label: 'Тёмная' }, { id: 'light', label: 'Светлая' }]} /></div>
    <div className={styles.layout}><div className={styles.previewColumn}><Workspace /><div className={styles.colorStrip} role="img" aria-label={`Палитра: все ${Object.keys(dark).length} цвета`}>{groups.flatMap(group => group.names).map(name => <span key={name} aria-hidden="true" style={{ background: `var(--color-${name})` }} />)}</div></div><aside className={styles.palette} aria-label="Редактор палитры">
      <div className={styles.paletteHead}><h2>Цветовые переменные <Badge>{Object.keys(dark).length}</Badge></h2><p>Пробные изменения сохраняются в этом браузере отдельно для каждой темы. Код проекта не меняется.</p><div className={styles.variantControls}><OptionSelect label="Сохранённые варианты" value={selectedVariant} onChange={selectVariant} options={[{ value: 'original', label: 'Исходная палитра' }, ...(selectedVariant === 'custom' ? [{ value: 'custom', label: 'Текущие правки' }] : []), ...variants.map(variant => ({ value: variant.id, label: variant.name }))]} /><Button variant="secondary" size="sm" disabled={invalid} onClick={() => { setVariantName(`Вариант ${variants.length + 1}`); setStorageError(false); setSavingVariant(true) }}>Сохранить вариант</Button>{variants.some(variant => variant.id === selectedVariant) && <Button variant="ghost" size="sm" onClick={deleteVariant}>Удалить вариант</Button>}{deleteError && <Notice variant="error" message="Не удалось удалить вариант. Проверьте доступность хранилища браузера." />}</div><TextInput icon="search" aria-label="Найти цвет" placeholder="Найти переменную…" value={filter} onChange={event => setFilter(event.target.value)} /><div className={styles.row}><Button variant="secondary" size="sm" onClick={() => { setCopied(false); setDrafts(current => ({ ...current, [theme]: {} })) }}>Сбросить тему</Button><Button size="sm" disabled={invalid || !Object.values(drafts).some(value => Object.keys(value).length)} onClick={() => { void navigator.clipboard.writeText(exportCss(drafts)).then(() => setCopied(true)).catch(() => setCopied(false)) }}>{copied ? 'Скопировано' : 'Копировать CSS'}</Button></div><Button variant="secondary" size="sm" disabled={invalid} onClick={download}>Скачать CSS</Button><span className={styles.hint}>Изменено в этой теме: {count}</span></div>
      <div className={styles.tokenList}>{groups.map(group => {
        const names = group.names.filter(name => `--color-${name}`.includes(filter.toLowerCase()))
        return names.length ? <details key={group.title} open><summary>{group.title}</summary><p className={styles.hint}>{group.usage}</p>{names.map(short => {
          const name = `--color-${short}`, value = draft[name] ?? palettes[theme][name]
          return <div className={styles.token} key={name} data-token={name}><button type="button" className={styles.swatch} style={{ background: `var(${name})` }} aria-label={`Выбрать ${name}`} onClick={event => pick(name, getComputedStyle(event.currentTarget).backgroundColor)} /><TextInput controlSize="sm" className={styles.tokenValue} label={short} aria-label={name} value={value} error={!validColor(value) ? 'Неверный CSS-цвет' : undefined} onChange={event => edit(name, event.target.value)} /></div>
        })}</details> : null
      })}</div>
      <details className={styles.export}><summary>CSS изменений · обе темы</summary><pre tabIndex={0}>{exportCss(drafts)}</pre></details>
    </aside></div>
    {savingVariant && <Modal title="Сохранить вариант палитры" size="sm" onClose={() => setSavingVariant(false)}><form className={styles.dialog} onSubmit={event => { event.preventDefault(); saveVariant() }}><TextInput label="Название варианта" autoFocus maxLength={80} value={variantName} onChange={event => setVariantName(event.target.value)} /><p className={styles.hint}>Сохраняются обе темы в этом браузере.</p>{storageError && <Notice variant="error" message="Не удалось сохранить вариант. Проверьте доступность хранилища браузера." />}<div className={styles.row}><Button variant="secondary" onClick={() => setSavingVariant(false)}>Отмена</Button><Button type="submit" disabled={!variantName.trim() || invalid}>Сохранить</Button></div></form></Modal>}
    {picked && <Modal title={picked.name} onClose={() => setPicked(null)} size="sm"><div className={styles.dialog}><ColorPicker value={picked.rgb} onChange={rgb => changePicked(rgb, picked.alpha)} mode="ring" /><div><div className={styles.row}><span>α</span><span>{Math.round(picked.alpha * 100)}%</span></div><PrecisionSlider orientation="horizontal" title="α цвета" min={0} max={100} step={1} value={Math.round(picked.alpha * 100)} onChange={value => changePicked(picked.rgb, value / 100)} /></div><Button onClick={() => setPicked(null)}>Готово</Button></div></Modal>}
  </main>
}
const meta = { title: 'Foundations/Palette playground', parameters: { layout: 'fullscreen', controls: { disable: true } }, render: function PaletteStory() {
  const [globals, updateGlobals] = useGlobals()
  return <Playground theme={globals.theme === 'light' ? 'light' : 'dark'} onThemeChange={theme => updateGlobals({ theme })} />
} } satisfies Meta
export default meta
export const Interface: StoryObj<typeof meta> = {}
