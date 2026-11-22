These test-only fixtures are generated from one self-authored Color Smudge KPP
and the accompanying 4×4 RGBA `tip.png`; no third-party artwork is included.
The KPP was built with `test_krita.kpp('<Brush type="png_brush" filename="tip.png" brushApplication="0"/>', engine='colorsmudge')` at 4e56467051.

For each revision (4e56467051 and 672e5a40cd), the same bytes were passed to
`convert_krita(path, Catalog(output), {'tip.png': tip_bytes})`, then
`Catalog.write()` produced `old.json` / `new.json`. Both produced one brush,
one identical CAS asset and no skipped brushes. The changed opacity curve and
identity are asserted in the storage test. The fixture is frozen converter
output; the test does not run historical converter code or render a stroke.
