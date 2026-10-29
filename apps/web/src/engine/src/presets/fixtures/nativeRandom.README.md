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
