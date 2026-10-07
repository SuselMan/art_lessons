# #728: устранение повторной очистки поля перед capture

База `9251028a`, ветка `agents/728-field-clear-opt`. Изолированное изменение:
`WatercolorSettlePlan.prepare` передаёт `captureClearsInputs=true` в lookup поля.
Обычные вызовы `_diffuseFieldFor`, включая `_dryWashScratch`, сохраняют прежнюю
очистку всех десяти текстур. Новые размеры и холодное создание не меняются.

## Инвариант

Для переиспользованного поля точного размера ранее выполнялось:
`clear(a,b,coverage,ca,cb)` → подготовка CPU/отдельных буферов →
`clear(a,b,coverage,ca,cb)` → stitch → дальнейшие операторы.
Первые пять clears удаляются: до второго clear нет чтения этих текстур.
Идемпотентное присваивание нулевого поля до первого чтения сохраняет значение.
Пять рабочих текстур `c,cc,mask,pressure,band` по-прежнему очищаются lookup.
Capture по-прежнему очищает все пять входных текстур целиком, до tile stitching;
края поля, области вне перекрытий и незаписанные каналы остаются нулевыми.

## Callers и lifetime

Production callers: контекст Plan и `_dryWashScratch`. Последний не использует
новый аргумент. Прежде чем lookup очищает или заменяет поле, `_completeSettle`
завершает предыдущего владельца. Prepare без перекрытий может отказаться уже
после lookup; следующая Plan capture всё равно очищает inputs, обычный caller
сбрасывает все десять. Исключение после lookup или dispose до capture не создаёт
неочищенного чтения у следующего caller. Context-loss/destroy/forget пути не
меняются, нового состояния ownership и новых ресурсов не вводится.
`clear` сбрасывает framebuffer в null и clearColor в ноль: сохранённые последние
lookup clears устанавливают то же GL-состояние. Mipmap validity обнулится capture
до чтения; эти field textures non-POT и nearest, других потребителей нет.

## Проверки

`WatercolorSettlePlan.captureClear.test.ts` использует настоящий Plan/Engine
с mock WebGL: texture-getter отвергает любое чтение до capture-clear. Матрица:
холодное/переиспользованное поле × radius8/200 × чужая вода/без неё; все операторы,
finish и dispose. Дополнительно проверены все десять default-clears, ровно пять
remaining reused-clears, замена размера1537, ранний отказ, исключение и dispose.
Существующая Plan suite проверяет жизненный цикл, loss, ownership, асинхронную
презентацию и capture. Результаты запуска сообщает сопровождающий commit/report.

Удаляются ровно пять clear submissions на reused prepare. Это не измеренное
ускорение GPU и не аппаратный pixel-parity gate. Перед объединением нужен
изолированный hardware A/B одинакового журнала с field/material/PNG parity,
живым штрихом, reload, undo/redo, несколькими слоями/цветами и context loss.
