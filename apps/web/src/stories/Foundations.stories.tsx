import { useLayoutEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import tokens from '../styles/tokens.css?raw'
import { Icon } from '../components/Icon'
import { MATERIAL_ICON_NAMES, CUSTOM_ICON_NAMES } from '../icons/iconNames'
const meta = {
  title: 'Foundations/Design system',
  parameters: { controls: { disable: true } },
} satisfies Meta
export default meta
const names = [...new Set(tokens.match(/--color-[\w-]+(?=\s*:)/g))]
function Palette() {
  const [values, setValues] = useState<Record<string, string>>({})
  useLayoutEffect(() => {
    const refresh = () => {
      const css = getComputedStyle(document.documentElement)
      setValues(
        Object.fromEntries(
          names.map((name) => [name, css.getPropertyValue(name).trim()]),
        ),
      )
    }
    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])
  return (
    <div className="workshop-grid">
      {names.map((name) => (
        <div key={name}>
          <div
            className="workshop-swatch"
            style={{ background: `var(${name})` }}
          />
          <code>{name}</code>
          <div className="workshop-label">{values[name]}</div>
        </div>
      ))}
    </div>
  )
}
export const Colors: StoryObj = { render: () => <Palette /> }
export const Icons: StoryObj = {
  render: () => (
    <div className="workshop-grid">
      {[...new Set([...MATERIAL_ICON_NAMES, ...CUSTOM_ICON_NAMES])].map(
        (name) => (
          <div className="workshop-icon" key={name}>
            <Icon name={name} />
            <code>{name}</code>
          </div>
        ),
      )}
    </div>
  ),
}
