# Внутренний local straight-RGBA8 composite pass

Не подключён к старым painters/PM layers/wire. Единственный режим — local
`optimized32-scalar-f32-rne-v1` alphaDarken creamy/hard через уже доказанный
SOURCE_ALPHA_DARKEN32_GLSL. Его numerical string не изменён. Нет заявления о
vector/native Android factory или outer Over/представлении результата.

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
VBO48bytes, одна программа/optional VAO. GPU charge=4WH+48, CPU reserve8240bytes
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
