# #680: бесцветный carrier и потеря пигмента при RGBA8 fit

База0e25da85, изолированный диагностический5295. Политика landing='fluid' одинакова, water='legacy'; сравнение включает ровно один pigment pass, после предварительной воды либо без неё. Оба carrier варианта читают одну after-delivery жидкость и имеют одинаковый source pigment dose. Варианты отличаются только разрешением бесцветной ink.a/r/g записи чистой воды; purewater.b и optical depth нулевые.

Legacy carrier вернул гладкость старой предварительной воды; noCarrier сохранил большие мраморные пятна. Но это не доказательство полезного физического разбавления. На настоящей Vega exact snapshot до первого транспорта доказывает:

| Значение | noCarrier | legacyCarrier |
|---|---:|---:|
| Source stamp dose descriptor | 6.806811171831074 | 6.806811171831074 |
| Pigment source film.b codes | 2180193 | 2180193 |
| Base pigment.b codes | 0 | 0 |
| Optical depth.a codes before settle | 2180193 | 2180193 |
| inkLoad.b after film recombine | 2180193 | 1601504 |
| Texels with base+film peak >1 | 0 | 78476 |

Старый `WC_FIELD_FIT(v)=v/max(1,max(v.r,v.g,v.b,v.a))` применяется к base+film. Дополнительный solvent carrier переполняет .a/r/g, а общий коэффициент сжимает и .b. **578689 pigment codes (26.54%) пропали ещё до settle**, хотя optical depth в отдельном буфере сохранился побайтно. Оба канала массы теперь не согласованы. На noCarrier потерь при recombine нет. CPU-oracle воспроизводит все noCarrier RGBA точно, legacy — с максимальным округлением1code и ни одной компонентой с ошибкой>1. Поэтому нельзя принять возвращённую гладкость как корректное решение воды/пигмента.

Мраморность видна в target appearance до `_finishRibbonStroke` — она не возникает впервые в carry/diffusion. В correct direct control carrier flag вообще ничего не меняет: все поля побайтно одинаковы. Восстановление carrier не создаёт pigment в чистой воде (b0, depth0); проблема возникает в последующем совместном headroom.

Артефакты `680-finite-water/temp/finite/accounting/`, `fit-oracle.json`, `carrier-before-after.jpg`, `landing-before-after.jpg`, `carrier-stage-cases.json`; GPU WebGL error0/contextLostfalse во всех4 carrier случаях. `watercolor-carrier-headroom-oracle.py <accounting-dir>` повторяет расчёт из exact base/film/load snapshots.

Следствие для dev-прототипа: независимый solvent V с отдельным bounded encoding/headroom, общий water delivery для pure/mixed input. Pigment/depth нельзя нормировать из-за solvent overflow. MAX wetness coverage — gate, не физический объём и не Darcy head. Новая state boundary должна включать snapshot/rebuild/undo, film release и измерение памяти, иначе опыт опять разойдётся между live и replay.
