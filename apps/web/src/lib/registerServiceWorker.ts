// (#48, #400) Registers the service worker and decides what happens when a
// newer deploy shows up while the app is open.
//
// The registration itself is the boring half. The interesting half is two
// questions the default answers wrongly for this app: *when do we find out*
// there is a new build, and *what do we do about it*.
//
// **When.** `registerType: 'prompt'` in vite.config.ts, because the default
// (`autoUpdate`) is skipWaiting + an unconditional reload, and this app must
// not reload itself out of a room: operations can be in flight, and #313
// treats losing them as serious enough for a `beforeunload` prompt. But
// `prompt` on its own only ever checks at registration: the browser re-fetches
// sw.js on a navigation inside the scope, and an SPA does not navigate. A tab
// left open across a day of deploys would never learn there was one — which is
// not "the user chose to stay on the old build", it is us never asking. So the
// checks below are on a timer, plus the two moments where a check is most
// likely to pay off: the tab coming back to the foreground, and the network
// coming back.
//
// **What.** See pwa/updatePolicy.ts — the short version is that a browser tab
// never sees an offer, because the platform already updates it when the last
// tab closes, and outside a room there is nothing to protect so the update is
// simply taken.
//
// This was not free to leave broken. Twice a manual check against production
// drew a conclusion from a pre-deploy bundle the service worker was still
// serving (#294 on 30.07, the join-request run recorded in #314 §6). Both
// times the tab had `registration.waiting` set and nobody had clicked.
import { decideUpdateAction, isInstalledApp, isResumeFromBackground } from '../pwa/updatePolicy'
import { translate } from '../i18n/translate'
import { pushNotice } from '../stores/noticeStore'
import { isReloadUnsafe, onReloadSafe } from './reloadSafety'
import { useSettingsStore } from '../stores/settingsStore'

/** How often to ask the server whether sw.js changed. A conditional request
 *  for one small file, so the interval is set by how stale we are willing to
 *  be, not by cost. Half an hour puts a lesson-length session inside one
 *  check. */
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

/** Floor between two checks, whatever triggered them. Without it, a tablet
 *  being picked up and put down fires `visibilitychange` every few seconds and
 *  each one would hit the network. */
const MIN_CHECK_GAP_MS = 5 * 60 * 1000

/** What a manual check found. Returned to Settings' own check button (#515),
 *  which has to say something either way — silence after pressing a button is
 *  indistinguishable from the button not working, which is the state this
 *  whole issue is about. */
export type UpdateCheckResult =
  /** A newer build was found; the page is reloading into it. */
  | 'updating'
  /** Asked the server, and this is the latest build. */
  | 'current'
  /** No service worker to ask — a dev build, or a browser without one. */
  | 'unavailable'

/** Set by registerServiceWorker once the worker is registered. Module-level
 *  rather than passed around because its one consumer is a button on a page
 *  that has no path to the registration otherwise. */
let checkNow: (() => Promise<UpdateCheckResult>) | null = null

/** Asks the server for a newer build right now, and applies it if there is
 *  one — the deterministic version of "is this device up to date", as opposed
 *  to force-quitting the app and hoping (#515).
 *
 *  Deliberately applies rather than offers, even from inside a room: pressing
 *  a button labelled "check for updates" *is* the human decision that the
 *  in-room prompt exists to collect, and asking twice for the same consent is
 *  how a person learns to ignore the asking. */
export function checkForUpdateNow(): Promise<UpdateCheckResult> {
  return checkNow ? checkNow() : Promise.resolve('unavailable')
}

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
    /** A build is waiting and we have not acted on it yet. */
    let pending = false
    /** Whether *this* waiting build has been offered already. Re-pushing the
     *  same offer would restart nothing and mean nothing — it collapses on its
     *  key and the news is already on screen. Reset per discovered build,
     *  though: an offer that was dismissed has been answered for that build,
     *  and a later deploy is worth mentioning again. */
    let offered = false
    /** Assigned by the registerSW call below. Held in a mutable binding rather
     *  than closed over as a `const` so that a callback arriving before that
     *  line returns leaves `pending` set instead of throwing on the temporal
     *  dead zone. registerSW cannot currently call back synchronously — it
     *  imports workbox-window first — but "cannot currently" is a property of
     *  someone else's code. */
    let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null

    function apply(): void {
      if (!updateSW) return
      pending = false
      // `true` tells the waiting worker to take over and reloads once it has.
      // #313's beforeunload does not stand in the way here and is not meant
      // to: a programmatic reload without user activation does not raise that
      // dialog at all. Which is exactly why the decision to reload has to be
      // made correctly *here* — nothing downstream will second-guess it.
      void updateSW(true)
    }

    function offer(): void {
      if (offered) return
      offered = true
      pushNotice({
        variant: 'neutral',
        message: t('update.available'),
        icon: 'cloud_sync',
        // Stays until acted on. An update offer that times out is worse than
        // none: it trains the user to ignore the strip, and the tab keeps
        // running the old build either way.
        durationMs: null,
        // Collapses repeats — an installed app left open across two deploys
        // would otherwise stack two identical offers.
        key: 'sw-update',
        action: { label: t('update.reload'), onClick: apply },
      })
    }

    /** Re-asks the policy. Cheap and idempotent, so it is called from every
     *  moment that could have changed the answer rather than from the one that
     *  looks most likely. */
    function settle(): void {
      if (!pending) return
      switch (decideUpdateAction({ reloadUnsafe: isReloadUnsafe(), installed: isInstalledApp() })) {
        case 'apply':
          apply()
          break
        case 'prompt':
          offer()
          break
        case 'wait':
          break
      }
    }

    updateSW = registerSW({
      onNeedRefresh() {
        pending = true
        offered = false
        // Booting straight into a room URL races the room's own hold, so an
        // update found in the first second can reload a tab that is about to
        // become "unsafe". Deliberately not guarded against: at that point the
        // room has drawn nothing and joined nothing, the queue is in IndexedDB
        // either way, and the cost is one more loading screen — once, because
        // after the reload there is no pending update left to find.
        settle()
      },
      onRegisteredSW(_swScriptUrl, registration) {
        if (!registration) return
        scheduleChecks(registration)
        // (#515) The manual check, wired only once there is something to ask.
        // Before this point checkForUpdateNow answers 'unavailable', which is
        // the truth: there is no registration to interrogate yet.
        checkNow = async () => {
          // An update discovered earlier and deferred (a room was holding the
          // reload) is already the answer — asking the server again would
          // find the same worker and waste a round trip to learn nothing.
          if (!pending) {
            try {
              await registration.update()
            } catch {
              // Offline, or the request failed. Not distinguished from "up to
              // date" on purpose: both mean "nothing new is being applied",
              // and a second message about network conditions on a button
              // press is noise the person cannot act on.
              return 'current'
            }
            await settledWorker(registration)
          }
          if (!pending && !registration.waiting) return 'current'
          apply()
          return 'updating'
        }
      },
    })

    // Leaving the room is the moment a deferred update has been waiting for:
    // the tab that could not be reloaded a second ago now can be, and the
    // reload lands on a page the user is loading anyway.
    onReloadSafe(settle)

    // A backgrounded tab is the best moment there is to reload — the user is
    // not looking at it, and they come back to the new build already running.
    // Still gated on the policy: a room holds even when hidden.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') settle()
    })
  })
}

/** (#515) Resolves once an `update()` has stopped producing a new worker —
 *  either one is sitting in `waiting`, or the fetch found nothing new.
 *
 *  `registration.update()` resolves when the *fetch* is done, not when the
 *  worker it found has finished installing, so reading `registration.waiting`
 *  straight after it reports "no update" for an update that is mid-install.
 *  That is the difference between the manual check saying "you are up to
 *  date" and it doing what it was pressed for. */
function settledWorker(registration: ServiceWorkerRegistration): Promise<void> {
  const installing = registration.installing
  if (!installing) return Promise.resolve()
  return new Promise<void>(resolve => {
    installing.addEventListener('statechange', function onState() {
      // 'redundant' as well as 'installed': a worker that failed to install is
      // finished too, and waiting for a state it will never reach would hang
      // the button forever.
      if (installing.state === 'installed' || installing.state === 'redundant') {
        installing.removeEventListener('statechange', onState)
        resolve()
      }
    })
  })
}

function scheduleChecks(registration: ServiceWorkerRegistration): void {
  let lastCheck = performance.now()
  let hiddenSince: number | null = null

  /** `force` skips the anti-thrash floor — see isResumeFromBackground. */
  function check(force = false): void {
    // A check while offline is a guaranteed failed request; `online` below
    // runs one the moment that stops being true.
    if (navigator.onLine === false) return
    if (!force && performance.now() - lastCheck < MIN_CHECK_GAP_MS) return
    lastCheck = performance.now()
    // Rejects on any network trouble, and nothing awaits this. An unhandled
    // rejection here would be the same class of noise #383 removed from the
    // socket path: one console error per flaky poll, and Sentry quota spent on
    // a client-side blip.
    void registration.update().catch(() => {})
  }

  setInterval(check, UPDATE_CHECK_INTERVAL_MS)
  // A tab that was in the background for a day is exactly the tab most likely
  // to be stale, and the moment it comes back is when that starts mattering.
  //
  // (#515) A long enough absence counts as a *resume* and skips the floor —
  // see isResumeFromBackground for why an installed app has no other moment.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenSince = performance.now()
      return
    }
    const away = hiddenSince === null ? 0 : performance.now() - hiddenSince
    hiddenSince = null
    check(isResumeFromBackground(away))
  })
  // Coming back online is the same kind of moment — whatever was missed while
  // offline is missed for as long as nothing asks.
  window.addEventListener('online', () => check(true))
}
