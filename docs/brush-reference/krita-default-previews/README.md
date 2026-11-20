# Original Krita preset artwork

These PNG files preserve the original preset artwork at its source dimensions.
Preset XML and embedded brush resources were removed; pixel artwork is preserved.
They are reference material, not generated tool photographs or brush tips.
`index.json` records preset names, filenames, PNG checksums and the pinned upstream
Krita source commit. The source lock is `scripts/brush-import/krita-stock-sources.json`.

The Krita 4 Default Resources bundle identifies its authors as Deevad, with
derivations from Ramon Miranda, Razvanc, Radian, Wolthera, Storm, Scottyp and others,
and declares CC-0 in `meta.xml`. Source files and their upstream metadata remain
available in the pinned source cache. Generated Grafetto tool photographs are
stored separately under `apps/web/src/assets/tools/krita`.

Reproduce with `scripts/brush-import/export_krita_previews.py` using a catalog and
its verified stock source cache. This directory is not loaded by the web client.
