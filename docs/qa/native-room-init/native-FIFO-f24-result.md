# ONE FIFO trace: scheduling and queue drain both block next contact

Exact source f24fec82, actual browser14, A15 plus existing3 ON, full/raw warm OFF.
GL0, no context loss, meaningful purple export and owned disposal passed. Raw
bounded markers/rAF, packed input and PNG were promoted before resource cleanup.
This is one observed run, not a paired performance result or physical first pixel.

| Next source barrier interval | Wall |
| --- | ---: |
| DOWN → consume entry | 1.3 ms |
| source admission → execution | 696.0 ms |
| admission → prior material publication start | 407.7 ms |
| prior publication start → done | 260.9 ms |
| publication done → next source execution | 27.4 ms |

After next source admission, the previous material still executed158 steps.
Their synchronous CPU entry walls sum29.2 ms;407.7 ms elapsed includes frame
scheduling and unfinished material work. The current adapter submits at most
8 steps per quantum and at most4 ms CPU work before yielding to the FIFO frame.
The source waits for that complete material request, not just its own submission.

The publication split is already present in existing markers:260.5 ms before
restoreCanvasPixels entry,0.2 ms in that GL import and0.2 ms until publication
completion. The actual path is copyByCanvas, not mapAsync/readField. It renders
raw native tile to the bridge canvas and awaits the original queue completion
before importing the canvas. That wait includes prior GPU work and callback
scheduling; it is not exclusive raw-draw GPU time. Optimizing CPU import or row
flipping cannot remove the observed260.5 ms pre-import interval. Downsampling
would change material bytes and is not a quality-preserving candidate.

The DOWN→source execution rAF overlap contains39 callback gaps, maximum33.3 ms,
with4 gaps above33 ms. Thus this capture observes substantial ordered source
latency while rAF still mostly runs. Marker overhead can affect the4 ms budget;
no unchanged cadence or causal comparison with the earlier f273 run is claimed.

Concrete first candidate: DEV OFF configurable material quantum cap16/32,
retaining original4 ms CPU budget, every job.step/finish/publication exactly once
and original FIFO order. This can reduce pacing gaps before publication while
leaving shaders and material state unchanged. It may move more GPU work into the
publication wait or increase queue pressure, so it needs same packed endpoint
parity, bounded outstanding GPU work/RAM and an independent comparison before
claiming improvement. It is not source preadmission and requires no COW scratch.
No such candidate has been enabled or hardware-tested by this trace.
