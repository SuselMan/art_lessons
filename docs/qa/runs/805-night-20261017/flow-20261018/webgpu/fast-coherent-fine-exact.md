# Точная быстрая подготовка на coherent+fine

`macro22-fast-coherent-fine.ts` экспортирует `fastCoherentFineDefinitions`, id `wgsl-macro-fast-coherent-smooth-fine-paper`. Это одна CPU оптимизация существующей ветки, не новая физика и не упрощённый PACK.

Macro18 получил optional fourth `{initializer?:typeof initialIntegerDynamic}` и передаёт его настоящей macro14factory. Defaultundefined выбирает старую функцию. Новый macro22 передаёт только `initialIntegerDynamicFast`. Coherent source/field construction/оригинальный MACRO10_LOCAL_PACK остаются прежними. Fine M/D initialization, integerpair operator, safe display PACK и borrowedbuffer hooks не меняются. Ветку Lite и её другой PACK здесь не используем.

Config array копирует прежние4macro18controls: coarse256/fine12/paper3/curl128eddy16; curl0; fine0; mobility6eddy24. Поэтому A/B можно делать на одном actualinput и одинаковых параметрах, без смешения gain/steps/model effects.

2CPU PASS: все compiled shader strings и allocations идентичны старому macro18; два upload с изменённымseed и frozen-capacity input дают побитово одинаковые GPUwrite values/offsets/bufferlabels, initialsummary и fieldSHA; dispatch/sharedoutput/readbackledger/cleanup совпадают. Optionalinitializer вызывается один раз на validupload, после существующей premul validation. TypeScript/lint PASS. Отдельный macro20proof уже сравнил все bytes13actualinputs и16random; NodeVPSскорость не переносится на GPU как обещание.

Нужен следующий actualSamsung A/B: fullRGBA/initial/final/field exact, then paired timings с раздельной CPU preparation и timed compute. Компиляция/загрузка/физика/финальныйreadback имеют разные границы. Никаких GPU действий/новых сервисов автором не выполнялось.
