import { useArgs } from 'storybook/preview-api'
import { fn } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { OptionSelect } from '../components/OptionPicker/OptionSelect'
const meta = {
  title: 'Controls/OptionSelect',
  component: OptionSelect,
  args: {
    onChange: fn(),
    label: 'Purpose',
    value: 'all',
    options: [
      { value: 'all', label: 'All' },
      { value: 'drawing', label: 'Drawing' },
      { value: 'eraser', label: 'Erasers' },
      { value: 'smudge', label: 'Blending' },
    ],
  },
  argTypes: { onChange: { action: 'change' } },
} satisfies Meta<typeof OptionSelect>
export default meta
export const Playground: StoryObj<typeof meta> = {
  render: function Example(args) {
    const [, updateArgs] = useArgs()
    return (
      <div className="workshop-column">
        <OptionSelect
          {...args}
          onChange={(value) => {
            args.onChange(value)
            updateArgs({ value })
          }}
        />
      </div>
    )
  },
}
export const InlineLabel: StoryObj<typeof meta> = {
  ...Playground,
  args: { showLabel: true },
}
export const Curves: StoryObj<typeof meta> = {
  ...Playground,
  args: {
    label: 'Tilt response',
    value: 'restrained',
    options: [
      {
        value: 'restrained',
        label: 'Restrained',
        curve: [0, 0.02, 0.08, 0.2, 0.4, 0.7, 1],
      },
      { value: 'smooth', label: 'Smooth', curve: [0, 0.2, 0.5, 0.8, 1, 1, 1] },
      { value: 'linear', label: 'Linear', curve: [0, 0.2, 0.4, 0.6, 0.8, 1] },
    ],
  },
}
