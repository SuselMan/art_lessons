/** (#462) Decides *whether* this client may bake a network snapshot right now,
 *  and from which watermark. `snapshotSync.ts` decides what a bake contains;
 *  this decides whether one is honest at all.
 *
 *  Split out of Room's `checkSnapshotBoundary` because the two production
 *  incidents in this area were both failures of exactly this judgement, and
 *  neither was reachable by a test while it lived inline in a 4600-line
 *  component. A stored snapshot is authoritative — the server withholds the
 *  operations it claims to cover — so a client that publishes one before it
 *  knows what the room contains does not degrade its own session, it erases
 *  the lesson for everyone who joins next.
 *
 *  The two things it exists to refuse:
 *
 *  - **Baking before the join/reconnect catch-up has finished.** `room_state`
 *    raises the client's known seq *synchronously* and then awaits the paper,
 *    the snapshot index, every layer blob, the image preload and the replay.
 *    Socket handlers stay live for all of it, so a peer operation arriving
 *    mid-restore used to reach the boundary check with a room-sized seq and a
 *    brand-new engine. On 2026-08-17 that published the empty room's structure
 *    over a four-layer lesson at seq 22400 of 22445 (prod room F4uw21Ob).
 *
 *  - **Claiming a boundary this client was not present for.** Coming back from
 *    a catch-up with the watermark still at 0, the next observation looks like
 *    a jump across every boundary the room ever crossed, so the client bakes
 *    immediately under the label of an old one — storing pixels that already
 *    include everything drawn since, which a later joiner then replays a
 *    second time on top. `restoreCompleted` seeds the watermark to where the
 *    catch-up landed, which is the same rule `handleRoomState` states for
 *    itself: history this client only just replayed is not history it
 *    witnessed.
 */
export interface BakeObservation {
  /** Highest seq known to have *arrived*, including bulk catch-up. */
  latestKnownSeq: number
  /** Seqs that have arrived but not yet painted — a peer stroke reveals
   *  progressively, and two reveals can finish out of order. The watermark may
   *  never pass the smallest of these, or a bake would miss an earlier
   *  operation that has not actually been applied yet. See
   *  `pendingPreviews.ts`, which owns the set this reads. */
  pendingCommitSeqs: Iterable<number>
  /** (#385) The join replay threw partway. The canvas shows less than the log
   *  says the room holds, permanently for this mount. */
  replayIncomplete: boolean
}

export interface BakePlan {
  /** Watermark before this observation — what `onSeqObserved` compares against
   *  to find a crossed boundary. */
  previous: number
  /** Watermark after it. The caller must store this. */
  watermark: number
}

export interface SnapshotGate {
  /** This client's catch-up ran to completion and the engine and store now
   *  describe the room. Call only from a path that actually finished — never
   *  from a `finally`, since a restore that threw leaves a client that must
   *  not speak for the room. */
  restoreCompleted(latestKnownSeq: number): void
  /** A reconnect's catch-up has begun. Closes the gate for its duration: the
   *  engine holds the room as it was *before* the drop — internally
   *  consistent, and stale by however many layers peers added meanwhile, which
   *  is the same publishable lie as an empty one and would pass every
   *  consistency check we have. */
  restoreStarted(): void
  /** `null` when nothing should be baked. Otherwise the watermark pair, and
   *  the gate has already advanced past it. */
  observe(input: BakeObservation): BakePlan | null
}

/** `report` — куда уходит замеченное нарушение (#480). Параметром, а не
 *  импортом: этот модуль чистый и проверяется без браузера и без Sentry, а
 *  единственный его вызывающий — Room — и так знает, кому докладывать.
 *  Умолчание молчит, потому что в тестах докладывать некому. */
export function createSnapshotGate(
  report: (name: string, context: Record<string, number>) => void = () => {},
): SnapshotGate {
  let restoreDone = false
  let committedWatermark = 0
  let warnedStale = false

  return {
    restoreCompleted(latestKnownSeq) {
      // Never walks backward: a reconnect that resolved to less than this
      // client already had must not re-open boundaries it has already baked.
      committedWatermark = Math.max(committedWatermark, latestKnownSeq)
      restoreDone = true
    },

    restoreStarted() {
      restoreDone = false
    },

    observe({ latestKnownSeq, pendingCommitSeqs, replayIncomplete }) {
      if (!restoreDone || replayIncomplete) return null
      let minPending: number | null = null
      let stale = false
      for (const seq of pendingCommitSeqs) {
        // (#477) A seq at or below the committed watermark cannot honestly be
        // "arrived but not yet painted": this client has already published a
        // snapshot claiming to cover it. So it is a leaked entry — some path
        // took an operation off the reveal queue without retiring it here —
        // and holding it would pin the watermark below what was already baked,
        // which makes `observe` return null forever after. That is precisely
        // the failure this guard exists to end: the room stops getting
        // snapshots for the rest of the session and every rejoin pays for it
        // in replayed operations. Ignoring the entry cannot make the stored
        // snapshot any less honest than it already is, and it lets baking
        // resume. `pendingPreviews.ts` is what stops one being leaked at all;
        // this is the net under it.
        if (seq <= committedWatermark) {
          stale = true
          continue
        }
        if (minPending === null || seq < minPending) minPending = seq
      }
      if (stale && !warnedStale) {
        warnedStale = true
        report('stale pending commit seq below baked watermark', { committedWatermark, latestKnownSeq })
      }
      const watermark = minPending === null ? latestKnownSeq : minPending - 1
      if (watermark <= committedWatermark) return null
      const previous = committedWatermark
      committedWatermark = watermark
      return { previous, watermark }
    },
  }
}
