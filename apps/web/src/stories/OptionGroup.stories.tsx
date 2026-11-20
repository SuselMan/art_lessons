import { useArgs } from 'storybook/preview-api'
import { fn } from 'storybook/test'
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { OptionGroup } from '../components/OptionGroup'
const options = [
  { id: 'pencil', label: 'Pencil', icon: 'edit' as const },
  { id: 'brush', label: 'Brush', icon: 'brush' as const },
  { id: 'eraser', label: 'Eraser', icon: 'ink_eraser' as const },
]
const meta = {
  title: 'Controls/OptionGroup',
  component: OptionGroup,
  args: {
    onSelect: fn(),
    options,
    active: 'pencil',
    ariaLabel: 'Drawing tool',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['tabs', 'choices', 'segmented', 'list'],
    },
    onSelect: { action: 'select' },
  },
} satisfies Meta<typeof OptionGroup>
export default meta
export const Playground: StoryObj<typeof meta> = {
  render: function Example(args) {
    const [, updateArgs] = useArgs()
    return (
      <OptionGroup
        {...args}
        onSelect={(active) => {
          args.onSelect(active)
          updateArgs({ active })
        }}
      />
    )
  },
}
function Variants() {
  const [active, setActive] = useState('pencil')
  return (
    <div className="workshop-column">
      {(['tabs', 'choices', 'segmented', 'list'] as const).map((variant) => (
        <section key={variant}>
          <h3>{{ tabs: 'Tabs', choices: 'Segmented · text', segmented: 'Segmented · icons', list: 'List' }[variant]}</h3>
          <OptionGroup
            options={options}
            active={active}
            onSelect={setActive}
            variant={variant}
            ariaLabel={`${variant} tool`}
          />
        </section>
      ))}
    </div>
  )
}
export const AllVariants: StoryObj<typeof meta> = {
  render: () => <Variants />,
}
export const CustomValue: StoryObj<typeof meta> = {
  args: { variant: 'choices', active: 'custom', allowEmpty: true },
}

export const TextSegments: StoryObj<typeof meta> = {
  name: 'Segmented · text',
  ...Playground,
  args: { variant: 'choices' },
}
export const IconSegments: StoryObj<typeof meta> = {
  name: 'Segmented · icons',
  ...Playground,
  args: { variant: 'segmented' },
}
