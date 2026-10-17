# Optional paper sampling diagnostic

`QA_POINT_PAPER=1` is OFF by default and compatible with the chosen forced-reference payload. It obtains the actual texture and world dimensions/scale from the owned synthetic engine's WatercolorPasses context, sets only MIN/MAG to NEAREST (no mipmap sampling), and restores previous filters in finally. Every temporary bind preserves current active texture unit and TEXTURE_BINDING_2D. No paper pixels, assets, shader or runtime source changes.

The report retains original/current filter enums, texture identity stability, paper world size/scale and qualification. A texture replacement or intervening filter change fails closed. All ten-stage/final Native/Paged gates remain required. An ON result is not compared to historical OFF golden as an equality requirement. Two CPU state/restoration tests pass; no GPU gate run during preparation. Outward1 pair is already exact, so this diagnostic is queued only if a later boundary warrants it.
