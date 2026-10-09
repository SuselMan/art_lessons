# Product next DOWN: почему вода → пигмент всё ещё может блокировать

В frozen `c2ee5645` текущий product-matched joinedTouch=true не разрешает любое касание мокрой бумаги. `_onStart` (`apps/web/src/engine/index.ts:6019`) берёт lease предыдущего settle только при сохранении его scratch/gesture, живом scratch, sourceFilmRebase, отсутствии async/material/splitQuanta, том же слое/сигнатуре и допустимой мокроте/времени. Существенный дополнительный предикат: прежние `touchInputs.preset` и `touchInputs.color` должны точно совпадать с текущими preset/color. DEV joinedTouchMixed разрешает альтернативу только при `touchInputs.finish?.gesture === touchInputs.gesture`.

Поэтому `normal:100:0:PB29:round` → `normal:100:100:PB29:round` отвергается даже на той же воде и с тем же цветом. После отказа `_onStart:6034` синхронно вызывает `_completeSettle`; тот вызывает `WatercolorSettleQueue.complete` (`index.ts:7972`). Только затем начинается новый source. Второй fallback на `index.ts:6112` сохраняет барьер, если последующая проверка joins/lease не подтверждена. Смена цвета аналогично отвергает product lease.

Добавленный CPU-тест реального Engine подтверждает именно порядок: `complete` раньше первого `_drawRibbonNibPass`, прошлый job больше не активен и lease=null. Все12 existing joinedTouch-тестов PASS. Это mockGL/source-order proof, не аппаратное время и не пиксельная эквивалентность mixed.

## Что подтверждено и что ещё неизвестно

Сохранённый product Surface gate с явным canonical idle между пятью короткими штрихами дал второй DOWN7.6мс и display-return6.9мс. Он не проверял pending mixed boundary: старый job уже был завершён. Не следует приписывать этим числам устранение пользовательской задержки вода→пигмент. Две Samsung long400 попытки остановились до input из-за отсутствующего Chrome DevTools socket; показателей второго DOWN у них нет.

Безопасный уже измеренный кандидат batch2 сохраняет порядок физических операторов и уменьшает время завершения job. Это может уменьшить остаток forced-drain на следующем DOWN, но данный эффект ещё не измерен. Нельзя выводить next-DOWN выигрыш из34% fixed replay wall.

Минимальный следующий proof должен отдельно записать pending job/remaining ops и причину lease-отказа перед DOWN для трёх случаев: одинаковые preset/color, вода→пигмент, смена цвета. Записываются `_completeSettle` CPU start/end и первый source/display без дополнительных GPU fences. Для оптимизации immediate preview следует использовать отдельный presentation owner с неизменным canonical порядком, а не просто включить joinedTouchMixed: CPU-тесты сохранности скопированных source-команд не доказывают правильность всех восьми полей и handoff.

Для mixed-lease допуска обязательны frozen previous finish/scratch gesture, собственные immutable source scalars/vertices и доказательство old-job-finish→source replay→next settle на same packed tape. До аппаратных field/material/whole+UndoRedo gates production defaults остаются неизменными.
