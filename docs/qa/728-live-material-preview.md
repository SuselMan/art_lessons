# #728: временный предпросмотр акварельного материала

Эксперимент OFF. Пользовательский стенд 5329 не менялся.

## Наблюдение

Read-only выборка Samsung nc3z6y в ye6OIPLN: 45 операций, asyncError=null,
контекст жив, очередь/settle/owners/films пусты. 120 выборок за 60 секунд также
были idle. Это НЕ запись самого выпадения preview из-за cap. Исходный код
выделяет полный viewport RGBA на каждый film и при 64 MiB возвращает null.
Устройство с viewport 2560×1600 достигает cap после четырёх таких буферов.

## Первый этап cd80c163

Один owner по layerId; бюджет включает заявленное число material/scratch planes.
Ключи delivery отделены от cumulative raster. Retirement не перерисовывает
оставшиеся marks. Replacement проходит через позицию/opacity слоя; canonical
export с includeWashReveal=false его не читает. Восемь CPU проверок и web TS PASS.

## Локальный material prototype

Собственный RibbonStrokePainter, scratch/pool и PaperWetness; фиксированный
projected target без создания соседних tiles. Цвет и preset передаются каждому
batch, gesture bridge не пересекает разные strokeId. Примитивы ribbon/material
общие с обычным рендерером; solver, журнал и canonical wet map не вызываются.
На первом owner GPU-копируется каноническая база слоя. Во время backlog растр
заменяет видимый слой целиком: он не добавляет второй раз пигмент поверх базы.
При handoff проверяются scratches/reveals соответствующего слоя. Loss забывает
ресурсы без GL-delete. Отдельное поле влажности объединяется только для экрана.

10 новых CPU тестов PASS; 39 существующих async tests PASS; web TS PASS.
Engine test действительно вызывает ribbon primitives, а не generic StampPainter,
сохраняет два accepted strokes, повторно использует owner и проверяет сумму
allocated pool live+free+output относительно reservation. Это MockGL, НЕ
аппаратное доказательство картинки, плавности или физической эквивалентности.

## Открыто перед включением

- Полный межслойный cap и изменение camera extent пока явно требуют fallback /
  reprojection; admission error нельзя оставить в продукте и терять input.
- Peer WC live packets пока идут старым путём; нельзя считать multiplayer live UX
  исправленным. Их presentation нельзя записывать в paintedTotal watermark.
- Projected resolution и округление могут менять видимые детали и grain origin;
  это presentation-only, а не доказательство full material parity.
- Нужны actual native Samsung water→pigment, visible intermediate screenshots,
  ограниченная память, natural canonical handoff без halo/doublepig, затем
  same-journal Dry/Undo/Redo/fresh canonical equality и cancellation/resize/peer.
