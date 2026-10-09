# ONE native interactive A ON: queued source delay

Runtime source: f2738e5b. This ONE run passed exact browser13, source15 plus
existing3 preparation/consumption, GL0, nonempty purple endpoint and owned context
cleanup. It does not establish physical first-pixel latency, GL parity or speedup.

| Marker interval | First water | Next pigment |
| --- | ---: | ---: |
| DOWN → Runtime.consume | 17.2 ms | 2.3 ms |
| consume → own emitPrepared | 47.6 ms | 968.6 ms |
| DOWN → canvas publication entry | 170.8 ms | 979.6 ms |
| DOWN → UP | 7138.7 ms | 822.4 ms |

Next pigment was admitted while canonical pending=true. Its first source entered
148.5 ms after UP. The first owner's seed read/flip/upload/queue ACK walls were
16.1 / 4.0 / 0.6 / 23.6 ms; no second seed marker occurred. These ACK walls are
not additive GPU durations. The previous water had eight source packets after
UP; its last source entry was at 32118.5 ms, 962.2 ms before next DOWN. Thus the
next delay is not explained by slow consume, first-owner seed, or simply waiting
for those previous source entries to execute.

Source audit identifies an explicit candidate: Runtime.finish queues
central.admitFactory(prepareSettle) after water source packets. Runtime.consume
then queues the next source behind that boundary in the same canonical FIFO.
The settle request steps its material job and awaits job.publish before it
releases the head. Each source request also awaits publishCurrentToGl. This
capture does not distinguish remaining settle steps, publication Promise wait,
FIFO blocked state or frame scheduling; it contains no task-specific GPU timing.
The wall interval between enqueue and execution is directly observed, while its
subdivision remains unmeasured.

Next bounded attribution should tag the already executing FIFO request kind,
its original step entry/return, publication invocation and original completion
continuation. Add scalar counters only, without Promise handlers, awaits, GPU
fences, extra readbacks or changing request order. Match next source ordinal to
its queue admission, and require bounded/restorable observer state. Preserve
material/publication order: bypassing a previous settle could change water and
pigment inputs, so this report does not authorize such a scheduling optimization.

The original primaryRaf was omitted from the bounded artifact whitelist and
was deleted with the disposable before aggregation. No rAF result is claimed.
The whitelist now preserves primaryRaf and strokeObservations, with a CPU test.
All interactive marker rows and endpoint/input passports were durably promoted
before cleanup; the compact summary retains the measured intervals.
