import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge } from '../components/Badge'
const meta = { title: 'Controls/Badge', component: Badge, args: { children: 7, tone: 'neutral', size: 'md' } } satisfies Meta<typeof Badge>
export default meta
export const Playground: StoryObj<typeof meta> = {}
export const AllVariants: StoryObj<typeof meta> = { render: () => <div className="workshop-row">{(['neutral', 'warning'] as const).flatMap(tone => (['sm', 'md'] as const).map(size => <Badge key={`${tone}-${size}`} tone={tone} size={size}>12</Badge>))}</div> }
