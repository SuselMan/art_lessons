import { useLayoutEffect } from 'react'
import type { Preview } from '@storybook/react-vite'
import { useSettingsStore } from '../src/stores/settingsStore'
import '../src/styles/global.css'
import './preview.css'

function Environment({
  theme,
  locale,
  children,
}: {
  theme: string
  locale: string
  children: React.ReactNode
}) {
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = locale
    useSettingsStore.getState().setLocale(locale === 'ru' ? 'ru' : 'en')
  }, [theme, locale])
  return <div className="workshop">{children}</div>
}
const preview: Preview = {
  tags: ['autodocs'],
  initialGlobals: { theme: 'dark', locale: 'en' },
  globalTypes: {
    theme: {
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        dynamicTitle: true,
        items: ['dark', 'light'],
      },
    },
    locale: {
      toolbar: {
        title: 'Language',
        icon: 'globe',
        dynamicTitle: true,
        items: ['en', 'ru'],
      },
    },
  },
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    options: {
      storySort: { order: ['Foundations', 'Controls', 'Overlays', 'Feedback'] },
    },
  },
  decorators: [
    (Story, context) => (
      <Environment
        theme={String(context.globals.theme)}
        locale={String(context.globals.locale)}
      >
        <Story />
      </Environment>
    ),
  ],
}
export default preview
