# Isolated native random CPU vectors

`nativeRandomOracle.cpp` directly executes Boost.Random taus88/uniform_smallint
and Qt5 QString qHash. `nativeRandom.vectors.json` stores 12 explicit uint32 seed
bit patterns, 8 keys including Cyrillic/CJK/emoji/NUL and canonical Unicode
variants, integer/normalized values, and C++ clone/serialized-state continuations.

Reproduction requires Boost headers, Qt5 development headers and Qt5Core library:

```sh
g++ -std=c++17 -O2 -fPIC -I<headers>/usr/include \
  -I<headers>/usr/include/x86_64-linux-gnu/qt5 nativeRandomOracle.cpp \
  /usr/lib/x86_64-linux-gnu/libQt5Core.so.5 -o oracle
./oracle > raw-vectors.json
```

The committed fixture keeps the raw cases and adds provenance: compiler/runtime
versions, source/header hashes, generator SHA and QtCore binary SHA. Reproduction
must compare numeric cases independently from provenance-specific build metadata.

**Scope:** actual local oracle is Boost1.83 / Qt5.15.13. The Krita AppImage uses
Qt5.15.7; it was not linked or instrumented here. The pinned upstream Qt5.15.7
and 5.15.13 `qhash.cpp` are byte-identical (both source hashes are recorded).
The tested default seed=0 QString hash uses UTF-16 DJB31XA; seeded CRC32 and Qt6
hashes are outside this model. This is source/function equivalence, not an
assertion of full AppImage ABI or rendering equivalence.

No active brush imports this primitive. Consumer ordering, gesture seed capture,
main/mask scheduling and shared/network schema admission remain separate work.

`nativeRandom.observed.json` contains numeric observations from the official pinned
Krita 5.3.4.1 AppImage (Qt 5.15.7), rather than the standalone Boost/Qt oracle.
Its provenance pins the source commit, AppImage and native DSO SHA256 hashes.
No brush assets, object addresses, process/thread IDs, local paths or raw logs
are included. `combined.draws` has 192 rows: consumer label index, logical dab
sequence, raw word, native normalized/bounded result and native threeword state
AFTER that draw. State before row zero is `initialState`; later rows continue
from the preceding state. GIH bounds are inclusive. The clone snapshot was
observed at construction; its unused continuation was not sampled natively.
The two keyed cases retain the observed shared-key first/second-painter results.

The labels describe ONE actual instrumented `Node.paintLine` schedule with
Size/Rotation/scatterXY/Opacity/Flow/GIH. A diagnostic logging mutex serialized
wrapped RNG calls and may alter planner/worker scheduling. These vectors are
regression evidence for arithmetic, state continuation and same-key correlation;
they neither select production consumers nor establish a universal live/paintAt
schedule, geometry equality or seed-only pixel identity. The diagnostic process
used a controlled exit after completed document work; normal Qt teardown is
outside this fixture. No native runtime is required to run these tests.
