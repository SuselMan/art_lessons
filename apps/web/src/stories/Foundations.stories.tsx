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

export const SpacingAndRadii: StoryObj = {
  name: 'Spacing and radii',
  render: () => (
    <>
      <section>
        <h2>Spacing</h2>
        <div className="workshop-column">
          {[...tokens.matchAll(/--space-(\d+)\s*:\s*(\d+)px;/g)].map(([, step, pixels]) => (
            <div key={step} className="workshop-row">
              <code style={{ width: 160 }}>{`--space-${step} · ${pixels}px`}</code>
              <span aria-hidden="true" style={{ display: 'block', width: `var(--space-${step})`, height: 8, background: 'var(--color-accent)' }} />
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2>Radii</h2>
        <div className="workshop-row">
          {['sm', 'md', 'lg', 'pill'].map(radius => (
            <div key={radius} style={{ width: 160 }}>
              <div style={{ width: 96, height: 48, marginBottom: 'var(--space-8)', border: '1px solid var(--color-border-strong)', borderRadius: `var(--radius-${radius})`, background: 'var(--color-surface-raised)' }} />
              <code>{`--radius-${radius}`}</code>
            </div>
          ))}
        </div>
      </section>
    </>
  ),
}
