# Явный server raster profile и verified resume

Policy хранит отдельные authorRasterProfile и allowedRecordedRasterProfiles.
Legacy rasterProfile singleton всё ещё поддержан для existing callers, но его
нельзя смешивать с author field. Список known unique1..2 копируется/замораживается;
author входит в него. Default old/[old], autoSources={} и straight admission
остаются OFF. Новый profile не является разрешением source family.

Resolver использует shared canonicalSourceComposition(desc, trustedProfile) и
existing source binding profile arguments. Остальные effect/domain restrictions
сохранены; V1 PNG generic grant запрещён. Composition mode/blend берутся только
из descriptor+policy. Admission сохраняет exact profile в signature и передаёт
его existing shared decoder во всех live/record/retry/hydration paths.

BEGIN сначала захватывает bounded resource input+permission, затем читает existing
count/history query. Нулевой prefix выбирает author default. Ненулевой prefix
передаёт actual indexed rows prepareResumeGesture; проверка indexed identity
предшествует profile selection, затем вся последовательность проверяется по
room/user/layer/brush/stroke/RGB/resource/seq/ordinal/profile. Profile должен быть
в server recorded allow-set. ROOM pin — единственный descriptor owner на resume;
conflicting personal/operator manifests не участвуют. Existing admission проверяет
полный доступный prefix. Сохраняются sync pin/commit и lifetime recheck; row не
создаёт synthetic receipt и не попадает в новый retained registry.

Descriptor binding теперь идёт после prefix read: invalid descriptor/defaultOFF
могут оплатить read count, но не pin/store/grant. Старые tests обновлены проверять
отсутствие writes, а history mock возвращает фактические rows из actual write spy.

Read capability выбирает profile лишь после actual row/succeeded resident proof,
server membership и descriptor binding. Same epoch scope публикует bounded
allowedRasterProfiles, отдельный canonicalAuthorRasterProfile сообщает author
default; default old-only wire shape не меняется. Mixed old/new gestures требуют
explicit captured receiver allow-set. Material V1/V2 mixed newreader остаётся
whole-batch unsupported, без преобразования old saved bytes.

Tests: four explicit GenericSC blends через SAME descriptor author/adapter/
encoder/live/durable/read, wrong-profile rejection; old recorded prefix под новым
author default, ROOM-only lookup, policy array mutation isolation, actual indexed
row tamper, malformed policy. Default/Gaussian/soft and actual socket regressions.
Native index59 Color остаётся closed. Synthetic tests не являются native GUI,
realDB durability или actual editor/device proof; actual retained native assets
нужны отдельному immutable descriptor/catalog proof.

HTTP activation идёт с paired reader e191795c6: actual Fastify+existing transport
возвращает exact bounded page200; V1 array bytes unchanged, failed projection409.
Actual Room engine/author wiring guards не открыты. Runtime/service copies нет.
