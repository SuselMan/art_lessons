# #728: immediate delivery extraction oracle

Verified candidate: `44c487d7`, relative to cleaned source-rebase `4f01243a`.
This does **not** verify the later deferred-material scaffolding (`cdd3fa33`,
`db71a100`) or an asynchronous Room queue.

On the genuine HOME Vega GPU, both arms replayed the same six-operation
journal. Each captured 12 nonempty material stages and 334 draw commands.
All full-buffer/channel FNV hashes and channel sums, bounded ROI bytes,
logical delivery metadata, finish contexts and draw-command order matched.
Full material buffers were read during capture; only hashes/sums and exact
bounded ROI bytes were retained, not complete raw material dumps.

Whole RGBA fixed-replay PNG comparison: **0 changed pixels / max 0**.
Each arm's separately generated native drawing versus its own checkpoint-free
rebuild also matched exactly. Both arms had GL error 0, no lost context and
closed their own Chrome in `finally`. No input-latency claim follows from this
instrumented run.

HOME source passport before candidate:

- index `50a92b0457a4a1e150aeeb0355c525aad6bbb6674ce92421f7674a8707dad89c`
- Scratch `90f412da62a7fd7187a729e458ee0abfaff74c04fc396be0df008cca3bb73b35`
- Plan `97d8daa7f29bec20835c4f233de4553c7b14ae38e70f12d872eaba7b4a75a66d`
- baseline Painter `bcea650065d4a80de353c93b8f40aa7ccbfa4793847d3af259ad7b12f53d3f00`
- candidate Painter `fc506e5e3de398b1e4e2e475af6b60cd1d2738e3b4974185a2a0fc39080599e0`

Raw evidence in HOME `680-water-wet-tone-qa/temp/history-parity/`:
`preparation-bootstrap-diagnostic/`, `preparation-corrected-candidate/`,
`preparation-corrected-comparison.json`. The bootstrap-labelled arm completed
successfully after the HTML was placed under the actual Vite root `apps/web`.
The preceding `preparation-corrected-baseline` timed out before engine creation;
its URL had served the app's index fallback. That fixture failure is excluded.
Older preparation reports with separate journals or empty capture functions
are also excluded from this material comparison.
