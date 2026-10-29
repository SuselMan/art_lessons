Independent compiled-source fixtures for `sourceDistanceTiming`.

The JSON records the pinned Krita source SHA/URL, harness SHA and audited Qt source
reference. Native `getNextPointPosition`, isotropic/anisotropic/timed methods are
compiled verbatim with small data/Qt shims, `-ffp-contract=off`. Rotation/map/type
shim follows upstream Qt5.15.2 identity Z-axis transform. This does not claim a
linked Krita/Qt binary or GUI test, nor identical arbitrary host trigonometric libm.

Input columns: distanceEnabled, isotropic, timingEnabled, accumulatedX, accumulatedY,
accumulatedTime, endX, endY, endTime, interval, rotation, flipped. Start is(0,0,0),
spacing axes(4,3). Result: chosen factor, accumulatedX/Y/time, spacing/timing refresh
elapsed counters. Cases exercise both branches together, minimum interval, both
rotation/flipped states, source rotation threshold and Qt diagonal classification.

`holds` uses native time-method calls and source `(1-t)*a+t*b` mixture at rate20,
1000,2.47 and343.61×0.115578. Stored positions start/end at(10,20); weighted mixtures
can move by an ULP even for a stationary input. `catchup` stores only the count/last
source time for a10000ms hold at1000/s, keeping the corpus compact. These source
results deliberately replace idealized evenly spaced numbers as the test oracle.
