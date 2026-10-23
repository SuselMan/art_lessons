# Native / packed residual: read-only аудит

Исходные отчёты: home680-watercolor-night-qa/temp/two-vega/run (9eb2a6fe), локальные копии temp/gallery-clip/packing-audit. Первичный остаток7356px/max10 сохраняется после совместной Dry; два свежих packed reader дают exact0. Это локализует расхождение до fresh replay, но не доказывает конкретный оператор.

Native _paintStrokeDabs сначала рисует исходные JS doubles и сохраняет PaperWetness standing по объектам оригинальных dab. _onEnd/_flushStrokeChunk упаковывают уже нарисованные dabs в Float32 десяти полей. Own ACK подтверждает applied id, не перерисовывает эту геометрию из packed data. Remote, restore/rejoin и foreign donor используют strokeDabs(op), преимущественно dabsPacked. Legacy plain dabs имеют приоритет, поэтому оба поля в синтетическом fixture нельзя считать чистым packing oracle.

У97 native и97 packed точек нет пропусков; packed поля равны Math.fround(native). Максимальное округление x около6.1e-5, size1.85e-6, t2.44e-5. Canonical settle radius уже нормализует исходный size/aspect перед умножением; source ribbon geometry/dose остаются исходными. Одного наличия Float32 разницы недостаточно для причинного вывода.

Два report.operations отличаются лишь color='[cycle]' у повторных ссылок диагностического сериализатора. Это не wire/journal разница, отчёт нельзя прямо подавать в replay; нужен JSON clone настоящих операций внутри страницы.

Single-chunk контроль36 water/31 pigment даёт exact native/peer/rejoin. Long-native-f32 контроль невалиден: wrapper клонирует dab, возвращает standing Map с clone keys, а engine запрашивает original dab. Nominalwater fallback изменяет PaperWetness; вывод 'rounding excluded' отозван. Sibling исправляет remap.

Chunk audit: native tail сохраняется, native flush запускает settle/newFilm. Donor source import aux releaseFilm/newFilm не выполняет тот же canonical settle. Переданный prevDab undefined не доказывает discontinuity: painter normalizeDeposit берёт scratch.lastKept, который newFilm сохраняет. Следующий честный oracle — полный source/film stage до/после chunk, одинаковые packed inputs и corrected standing ownership, без изменения модели.
