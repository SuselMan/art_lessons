# Committed-core readback candidate — external, NOT runtime

This candidate only reduces GPU→CPU reads AFTER the unchanged Native solver
has completed. It neither crops solver input nor changes the 1536px field,
612px influence certificate, shaders, global phases or output ownership.

Read the union bounding rectangle of the already-owned cores, in window-local
GL coordinates. Scatter each core using offsets relative to that read rectangle.
Unknown geometry falls back to the full existing read. All three material
planes follow the same mapping. CPU pixel equivalence and native A/B are required
before integration; no speed claim is made by this draft.

CPU validation:10 tests PASS, every owned core on all six formats plus1537×1553/2177×901 odd edge sizes, negative origins and malformed fallback. Native proof still pending. Root/RCA geometry review found no blocking issue.
