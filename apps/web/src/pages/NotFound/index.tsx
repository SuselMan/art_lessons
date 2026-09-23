import { useT } from '../../i18n'
import { StatusCard } from '../../components/StatusCard'

// (#572) The `path="*"` route. Before it, an address that matched nothing —
// a typo, a doubled slash (`//room/<id>`), a link from an old build —
// rendered an empty <Routes>: the app's background and not a word, which
// reads as "the app is broken" rather than "the link is wrong". The two
// links are the two places a person can actually go from here without a
// working room link: their own list, or a fresh project.

export function NotFound() {
  const t = useT()
  return (
    <StatusCard
      heading={t('notFound.heading')}
      body={t('notFound.body')}
      action={{ label: t('notFound.toLessons'), to: '/my-lessons' }}
      secondary={{ label: t('notFound.create'), to: '/create' }}
    />
  )
}
