import { useArgs } from 'storybook/preview-api'
import { fn } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { NumberField } from '../components/NumberField'
const meta = {
  title: 'Controls/NumberField',
  component: NumberField,
  args: { onChange: fn(), label: 'Size', value: 24, min: 1, max: 120, step: 1 },
  argTypes: { onChange: { action: 'change' } },
} satisfies Meta<typeof NumberField>
export default meta
export const Playground: StoryObj<typeof meta> = {
  render: function Example(args) {
    const [, updateArgs] = useArgs()
    return (
      <div className="workshop-column">
        <NumberField
          {...args}
          onChange={(value) => {
            args.onChange(value)
            updateArgs({ value })
          }}
        />
        <output>{args.value}</output>
      </div>
    )
  },
}
export const ToolbarReadout: StoryObj<typeof meta> = {
  ...Playground,
  args: { variant: 'readout', format: (value) => `${value}px` },
}
