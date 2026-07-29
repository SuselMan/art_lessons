// (#48) Registers the service worker and decides what happens when a newer
// deploy shows up while the app is open.
//
// The registration itself is the boring half. The interesting half is that
// this app must not reload itself: a room can hold operations that have not
// reached the server yet, and #313 already treats losing them as serious
// enough to warrant a beforeunload prompt. A service worker that swaps itself
// in and refreshes the page would walk straight through that guard — the
// teacher is mid-stroke, the tab reloads, and the queue is gone. So the new
// version waits, and the user is told it is there.
//
// That is also why `registerType: 'prompt'` in vite.config.ts: the default
// (`autoUpdate`) is skipWaiting + reload, which is the behaviour above.
import { translate } from '../i18n/translate'
import { pushNotice } from '../stores/noticeStore'
import { useSettingsStore } from '../stores/settingsStore'

// Not a React component and not inside the provider tree — this runs before
// the app mounts — so the locale is read from the store directly rather than
// through useT(), and read at push time rather than at registration: the
// worker can find an update long after boot, by which point the user may have
// changed language.
function t(key: 'update.available' | 'update.reload'): string {
  return translate(useSettingsStore.getState().locale, key)
}

export function registerServiceWorker(): void {
  // The dev loop has no service worker at all (devOptions.enabled: false), so
  // the virtual module's register is a no-op there — but importing it eagerly
  // would still pull workbox-window into the dev bundle for nothing.
  if (!import.meta.env.PROD) return

  void import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh() {
        pushNotice({
          variant: 'neutral',
          message: t('update.available'),
          icon: 'cloud_sync',
          // Stays until acted on. An update offer that times out is worse
          // than none: it trains the user to ignore the strip, and the tab
          // keeps running the old build either way.
          durationMs: null,
          // Collapses repeats — a tab left open across two deploys would
          // otherwise stack two identical offers.
          key: 'sw-update',
          action: {
            label: t('update.reload'),
            // `true` tells the waiting worker to take over and reloads once
            // it has. Everything the user could lose is behind this click,
            // and #313's beforeunload still fires if the queue is not empty,
            // so the reload is not the last line of defence.
            onClick: () => void updateSW(true),
          },
        })
      },
    })
  })
}
