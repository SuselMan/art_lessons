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
      <ColorWell label="Single colour" fill={[85, 85, 170]} />
      <ColorWell
        label="Stroke and fill"
        fill={[200, 180, 140]}
        stroke={[85, 85, 170]}
      />
      <ColorWell label="No fill" fill={null} stroke={[85, 85, 170]} />
      <ColorWell label="No stroke" fill={[200, 180, 140]} stroke={null} />
      <ColorWell
        label="Editing stroke"
        fill={[200, 180, 140]}
        stroke={[85, 85, 170]}
        highlight="outer"
      />
      <ColorWell
        label="Editing fill"
        fill={[200, 180, 140]}
        stroke={[85, 85, 170]}
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
    const [value, setValue] = useState<[number, number, number]>([85, 85, 170])
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
