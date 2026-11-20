import { useArgs } from 'storybook/preview-api'
import { fn } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { PrecisionSlider } from '../components/PrecisionSlider'
const meta = {
  title: 'Controls/PrecisionSlider',
  component: PrecisionSlider,
  args: {
    onChange: fn(),
    value: 50,
    min: 0,
    max: 100,
    step: 1,
    orientation: 'horizontal',
    trackSize: 280,
    title: 'Intensity',
  },
  argTypes: { onChange: { action: 'change' } },
} satisfies Meta<typeof PrecisionSlider>
export default meta
export const Playground: StoryObj<typeof meta> = {
  render: function Example(args) {
    const [, updateArgs] = useArgs()
    return (
      <div className="workshop-column">
        <PrecisionSlider
          {...args}
          onChange={(value) => {
            args.onChange(value)
            updateArgs({ value })
          }}
        />
        <output>{args.value}%</output>
      </div>
    )
  },
}
export const Vertical: StoryObj<typeof meta> = {
  ...Playground,
  args: { orientation: 'vertical', trackSize: 180 },
}
