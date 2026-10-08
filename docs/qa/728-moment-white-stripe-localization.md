# #728: локализация белых полос нового transport (offline)

ON wetmix screenshot содержит ровные светлые горизонтальные полосы в жёлтом/overlap пятне; reference OFF screenshot их не показывает. Это quality FAIL для приглашения на «улучшенную акварель». Три actual ON контакта supported/applied и GPU errors[] не доказывают визуальную корректность. Independent live arms имеют разные generated stroke/wash IDs/timestamps; источники шума/settle не были заморожены между ними.

## Сохранённый воспроизводимый источник

Фактическая ON tape экспортирована из локальной QA БД read-only: `temp/fast-watercolor-night/room-vector-wetmix-on-surface-20261008/original-tape.json`. Ровно3 original strokes, каждый packed58bytes, original wet/preset/IDs/color/time сохранены. Структурный layer fixture добавляется явно с original layerId; seq нормализуется только как log bookkeeping и записывается отдельно. Нет повторного smoothing/генерации дабов.

## Аудит адресации и ordering

PACK/UNPACK оба используют xy=(x+i%width,y+i/width), records=i*10. P=[R,G,B,A] indices0..3, C indices4..7; новый operator переносит indices2,4,5,6,7. Wet/contact8/9 и P.R/G/A не изменяются. ROI pack завершён до separate storage unpack; available/contact отдельны от material; interpass pingpong source/target distinct, outside ROI storage writes не выполняются. Global invalid завершён pack до pairpasses.

Pair X: v=x, neighbor=i+1 только приx+1<width. Pair Y:v=y, neighbor=i+width только приy+1<height. Обе parity branches копируют unmatched край; exhaustive offline ownership check10260 сочетаний(width1..513,height1/2/3/7/13,axis/parity) дал ровноодин writer/cell и no neighborwrap. Это проверка алгоритма индексов, не самостоятельное доказательство hardware buffer correctness. Tiny17×13 copy/inplace allRGBAoracle уже exact, но это не actual large sparse footprint.

Capacity limiter рассчитывает одну lambda по всем5каналам, source/receiver зависит от sign direction; суммы сохраняются. На held first contact prepareMomentSegment сбрасывает state при отсутствии previous, directionzero: между разными strokes teleport direction не наследуется. Поэтому этот wetmix должен активировать mixing, а не направленный advection. Recipe trace потребуется сохранить в same-tape arms, чтобы проверить фактическое направление. Ни clock/pressure/source fit, ни carrier clamp менять ради полос нельзя.

## Следующий ограниченный диагностический cohort

Controller `9b8f31e3` + `6c9a3130`, QA_SCENARIO=fixedwetmix, QA_TAPE=saved ON artifact, frozen sourceab1dd3db/5356. Последовательно fresh OFF, ON; при нужном isolated control ON+QA_MOMENT_ZERO=1: только rates0, та же source/rebase/publication seam. Negative control строго проверяет реально полученные source recipes rates0. Defaults/runtime не меняются.

Сравнить decoded whole export и final screenshot, canonical packed params/paper/wet/seed одинаковы. OFF/ON не обязаны exact; OFF/zero ожидается diagnostic equality для отделения pack/rebase от arithmetic, но нарушение означает локализацию, не automatic new-model reject. Для spatial attribution следующими точками нужны actual material до транспорта/после unpack/после rebase/после settle; не всё сразу и не полные1536field dumps. Ровные полосы в zero arm направят анализ на contact/source/rebase/publish; только в active arm — mixing/receiver/finalfit. Stage observations не заменяют proof.

Full viewport,512²ROI baseline/final readback и один whole export: около19.5MiB/arm; no all-owner-field capture. RAM1700 preflight/500 abort, owned pages only; hardware только после root allocation. Surface сейчас занят другим gate, Samsung запрещён. Никакого художественного улучшения или latency выигрыша пока не заявляется.
