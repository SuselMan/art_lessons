import { hexToRgb } from '../lib/browser/color'
import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ColorWell } from '../components/ColorWell'
import { ColorPicker } from '../components/ColorPicker'
const meta = {
  title: 'Controls/Color',
  parameters: { controls: { disable: true } },
} satisfies Meta
export default meta
export const Wells: StoryObj = {
  render: () => (
    <div className="workshop-row">
      <ColorWell label="Single colour" fill={hexToRgb('#5555aa')} />
      <ColorWell
        label="Stroke and fill"
        fill={hexToRgb('#c8b48c')}
        stroke={hexToRgb('#5555aa')}
      />
      <ColorWell label="No fill" fill={null} stroke={hexToRgb('#5555aa')} />
      <ColorWell label="No stroke" fill={hexToRgb('#c8b48c')} stroke={null} />
      <ColorWell
        label="Editing stroke"
        fill={hexToRgb('#c8b48c')}
        stroke={hexToRgb('#5555aa')}
        highlight="outer"
      />
      <ColorWell
        label="Editing fill"
        fill={hexToRgb('#c8b48c')}
        stroke={hexToRgb('#5555aa')}
        highlight="core"
      />
    </div>
  ),
}
function InteractivePicker({ mode, ...props }: ComponentProps<typeof ColorPicker>) {
  const [selectedMode, setSelectedMode] = useState(mode)
  return <ColorPicker {...props} mode={selectedMode} onModeChange={setSelectedMode} />
}
export const Pickers: StoryObj = {
  render: function Example() {
    const [value, setValue] = useState<[number, number, number]>(hexToRgb('#5555aa'))
    return (
      <div className="workshop-row" style={{ alignItems: 'flex-start' }}>
        {(['bar', 'ring', 'triangle'] as const).map((mode) => (
          <section key={mode} style={{ width: 260 }}>
            <h3>{mode}</h3>
            <InteractivePicker value={value} onChange={setValue} mode={mode} />
          </section>
        ))}
      </div>
    )
  },
}
