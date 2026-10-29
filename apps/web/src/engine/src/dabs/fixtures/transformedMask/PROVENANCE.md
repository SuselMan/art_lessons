# Внутренний prepass преобразованных масок

`TransformedMaskPrepass` — opt-in сервис, пока не подключённый к художникам,
wire-дескрипторам или авторингу. Он использует существующие
`sourceImageTransformPlan`, `sourcePngRasterShape` и
`affineImageSpan16Coordinates`, общий PM16 shader и Qt wordsize64 store.
Математика трансформации и квантования не продублирована.

Профили декодирования задаются явно: `wide8-separate-wordsize64` и
`neon4-summed-wordsize64`. Это выбор доказанной исходной операции, а не
утверждение о dispatch установленной Krita для произвольного изображения.
Поддержаны подготовленные straight RGBA8 уровни с серыми RGB и alpha.

До ввода `prepare` резервирует конечный набор source textures, два factor LUT
(512 KiB), VBO и фиксированный пул target textures. Все GPU-байты включаются
в существующий 16 MiB cache. Staging, планы и временный LUT учитываются в
существующем 4 MiB CPU cache. Расширение L8→RGBA при подготовке источников
обязан учитывать владелец банка; копии RGBA на CPU сервис не сохраняет.
Промах преобразования не создаёт текстур и не вызывает texImage2D.

`resolveGroup` возвращает lease до окончания потребления; вызывающий обязан
освободить её в finally. Результат — уже преобразованная coverage в каждом
канале RGBA, UV valid-rect и отдельные post-raster mirror flags. Повторное
применение исходной tip-матрицы недопустимо. Без OES_vertex_array_object
восстанавливаются активные attribute pointers; исходный неактивный NULL
pointer WebGL1 не позволяет восстановить через vertexAttribPointer.

Доказательства хранятся приватно в fixes-v52: composed GPU proof на Samsung,
194 материала / 31 132 пикселя: все четыре канала совпали с независимым
существующим CPU-профилем. Это не прямой readback PM16 из установленной Krita.
CPU unit tests отдельно проверяют неизменный row staging, бюджеты,
предварительную валидацию, повторное использование, сбои и очистку при потере
контекста. GPU service proof дополняет проверку реального lifecycle: 98 случаев на
Samsung, wrong0/maxDelta0/GL0. Каждый промах: одна drawArrays и ноль texture
uploads; каждый повторный hit: ноль draws/uploads. Учтено 553 884 GPU-байта
и 568 896 CPU-байт. Проверена highp precision23. Это внутренний сервис,
ещё не подключённый к painter/авторингу.

Одновременно допустима одна возвращённая группа. Повторный resolve до release
явно отклоняется; release идемпотентен. Reset инвалидирует старые release,
которые не могут разблокировать новую группу.

Скопированного текста GPL-реализации здесь нет: используется существующий
общий проектный численный слой, его provenance и лицензии сохраняются в
соответствующих исходных файлах.

## Подготовленный исходный банк

`CanonicalMaskSourceBank` планирует все уровни через существующий NativeImageBank.
Допустима только trusted imageSampling/inverse-gray provenance исходного
непрозрачного серого изображения. Произвольная coverage с потерянной исходной
alpha не подходит. NativeImagePixels сохраняет обратимость: brightness сначала
масштабируется, потом инвертируется; восстанавливается только interior как
RGB=255-L8, alpha255, а прозрачная рамка остаётся RGBA0.

Uploaded bytes проверены на 104 существующих native fixtures (8 prepared grids
Qt5.15.13, 96 pinned source-image opaque-gray levels): все 74 668 байт совпали.
Подготовка банка — отдельный этап от native affine PM/store dispatch.

Пик CPU — максимум двух фаз: generation (croppedN+brightnessN+scaledM+borderL8B
и resize-axis heap estimate512 bytes per source/destination axis unit) либо
expansion (borderL8B+RGBA4B). После возврата nativeImagePixels его временные
массивы уже недостижимы; отложенный GC не является гарантией жёсткого heap cap.
Reachable working-set дополняется metadata
512 bytes/job и явно переданный companion prepass budget. Временный резерв
берётся до crop/resize/expansion, cached L8 также остаётся в общем bounded cache;
RGBA CPU копии не сохраняются. GL уровни NEAREST/CLAMP, без mipmaps.

Metadata-only аудит 17 source-author кандидатов с companion128×128/2slots
(692224 GPU и CPU bytes): 17 admitted. Источник153×64 с native максимальным
уровнем1224×512 помещается по phase-lifetime budget; более крупные банки
явно отклоняются до allocation. Уровни не пропускаются и fallback не включается. Это проверка возможностей внутреннего банка, не изменение
поддержки каталога или активного renderer.
