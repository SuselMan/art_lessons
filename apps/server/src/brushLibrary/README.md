---
layer: server
summary: каталог кистей
tags: [кисти, ресурсы]
---
# Brush library

Read-only HTTP catalog of imported brush descriptors and content-addressed grayscale
textures. `GRAFETTO_BRUSH_LIBRARY_DIR` explicitly enables a private operator-provisioned
catalog (`manifest.json` and `<sha256>.bin` files); without it clients receive an empty
schema-version-1 library. No upload or conversion endpoint exists. Production identity
hooks remain enabled; private QA origins must have their existing access protection.

Startup rejects symlinks, traversal, missing references, invalid texture dimensions or
hashes, manifests above 2 MiB and texture totals above 256 MiB. Verified bytes stay in
memory so catalog changes require restart and cannot alter an existing asset response.
