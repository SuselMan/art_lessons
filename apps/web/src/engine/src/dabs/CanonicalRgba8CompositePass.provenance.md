# Внутренний local straight-RGBA8 composite pass

Не подключён к старым painters/PM layers/wire. Поддерживаются два конечных семейства: local alphaDarken creamy/hard и explicit
Over32 scalar profiles. Используются уже доказанные SOURCE_ALPHA_DARKEN32_GLSL и
SOURCE_OVER32_SCALAR_GLSL без изменения numerical strings. Нет заявления о
vector/native Android factory или подключении к текущему frame pipeline.

Target требует brand canonical-straight-rgba8-v1: texture/FBO RGBA8 со straight
RGB, размеры и TOP-left world origin. GL row0 назначения — его логический низ.
FBO attachment identity проверяется до copy; source/target/scratch alias запрещён.
Source — уже разрешённый TransformedMaskView, cached key/handle проверяется.
Его GL row0 — logical TOP, coverage.r; valid UV bounds и post-raster mirror
применяются один раз. Tip matrix/nativeDomain не повторяются. Pigment — три
прямых U8 RGB канала; A8 берётся ТОЛЬКО из маски, заменяя исходную ink alpha.

Сначала целочисленный world clip. Для пересечения[x0,y0,x1,y1] target GL rect:
[x0-originX, H-(y1-originY), x1-x0, y1-y0]. Только этот rect копируется
copyTexSubImage2D в scratch[0,0,w,h]. Draw читает старое назначение из отдельного
scratch, а не одновременно читаемой/записываемой target texture. Source logical
pixel вычисляется по маленьким local coords: offset+(localX,clipH-localGLY),
затем mirror индексов и valid UV. Большие world origins не попадают в float uniforms.

Подготовка — фиксированные W/H<=4096, area<=1M, одна scratchRGBA8 texture,
VBO48bytes, одна программа на запрошенное семейство (максимум две)/optional VAO.
GPU charge=4WH+48, CPU reserve=48+8192*число семейств (8240bytes по умолчанию)
для staging/program/uniform/state metadata. Driver compiler/binary allocations
непрозрачны: texture budget не является гарантией hard vendor driver heap cap.
Ни полного tile copy, ни pixel CPU arrays/uploads/readback при draw нет.

prepare(limits,companionResources,companionCpuBytes,signal) проверяет source bank
и prepass workspace/slots по реальным cache charges. GPU суммы dedup по keys.
CPU учитывает max(текущие companion reservations, переданный companion estimate),
а не повторно складывает уже зарезервированные companions. Source bank plan должен
изначально включать этот pass в companion budget. Буфер назначения принадлежит
внешнему владельцу и учитывается им отдельно, это не скрытый cache allocation.

GL-state capsule BrushGlState извлечена из прежнего prepass без изменения логики;
оба pass используют её, touched texture units задаются явно(3/2). Optional OES VAO
изолирует attributes; fallback восстанавливает live pointers/enables/divisors с
прежним ограничением NULL pointers WebGL1. prepare/copy/draw error и finally
возвращают state, lease и reservations. reset(false) удаляет только свои ресурсы,
reset(true) forget-only; external target/source ownership не меняется.

Meaningful CPU/MockGL regressions проверяют clip/subrect copy/relative coords,
повторный feedback-copy перед overlap draw, отсутствие hot allocation/uploads,
неподходящий PM-brand/alias/attachment/controls до изменения pixels, shared quota,
отсутствие двойного companion CPU charge, copy failure/retry, VAO и disposal/loss.
Это не численный GPU oracle: combined prepass+pass и итоговый RGBA buffer должны
дополнительно сравниваться root на реальном устройстве.

## Расширенный API: проверка устройства ещё требуется

`drawSource` принимает maskRgb либо straightRgba8 view, операцию alphaDarken32
либо over32 и optional immutable readDestination. Последний имеет ту же геометрию,
что output; каждый preview копирует именно этот base, поэтому смена opacity не
накапливает повторный Over. RGBA source сохраняет собственные RGB/A8, без ink-alpha
множителя. Source==output запрещён; source==base при другом output допустим.
Старый draw остаётся синхронным совместимым адаптером.

RGBA view объявляет unscaled integer UV subrect, rowOrder и post-raster mirror.
Cache residency проверяется по key/handle/actual bytes; external residency требует
явного owner/lease. Output/base также держатся внешними leases до завершения draw.
Straight RGBA8 brand — обязательный контракт владельца: WebGL1 attachment identity
не доказывает internal format. Перед sampling сохраняются MIN/MAG/WRAP_S/WRAP_T,
временно выставляются NEAREST/CLAMP и восстанавливаются до GL bindings и освобождения
leases, включая draw failure; при context loss восстановления не выполняется.

12 CPU/MockGL тестов включают две bounded программы, repeated immutable-base
preview, alias/metadata rejection до lease/copy, source==base, byte controls,
ориентацию и восстановление четырёх sampler parameters после success/error.
Эти тесты не заменяют pending actual GPU gate расширенных веток.

## Joined device gate (исходный pass 1bc11f408)

Actual Samsung SM-T970 / Adreno650 WebGL1 highp23:102 trials with306
submitted sequential draws, including empty clips.98 material/profile cases
and4 right-edge4096x8 targets;13 deduplicated prepared sources. CPU expected
uses separately verified mask bytes and common scalar AlphaDarken32, not a
duplicate GPU formula. All whole-target bytes exact; state restored, no hot
uploads, cache hits no work, GL errors empty. All own GPU/cache/CPU reservations
released in finally. Private reproduction: fixes-v52/run-canonical-composite.mts
and canonical-composite-body.js; receipt canonical-composite-device-result.json.

The first harness attempt rejected source upload before protection; the harness
was corrected to protect the finite source group before cache.put, with no
production code change. This proves this isolated prepass/composite path only,
not current app PM storage, wire/replay, native vector dispatch or whole brushes.
