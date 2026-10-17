# #792: обычный pen-up не завершает ownership незаписанного live-хвоста

Дата: 17.10.2026. База `7f6193e8` (#786); отдельный worktree/ветка
`792-ended-live-ownership` / `agents/792-ended-live-ownership`.
Issue: https://github.com/SuselMan/art_lessons/issues/792.

Прочитаны #775/#776 и покрытие #780–#786: refold rejected controls, old Outbox
callbacks и отключение ДО UP уже проверены. Новый случай — disconnect ПОСЛЕ UP,
пока финальная операция ещё ждёт Outbox/IndexedDB и другой сокет автора жив.

## Baseline

Один новый настоящий Socket.IO regression FAIL / 45 skipped:
непустой watercolor live packet → observer получил normal end → авторский socket A
отключён (server disconnect awaited), sibling B того же userId остаётся.
Participant присутствует, accepted tail пустой, peer_left нет, cancellation нет.
Engine normal-UP сохраняет film, пока не придёт operation: незаписанный хвост
оставался у наблюдателя без пути очистки. Backend source до просмотра reproducer
координатором не менялся.

## Узкий фикс после согласования схемы

Private server ownership считает relayed и accepted dab prefixes отдельно для
каждого слоя gesture. Retirement требует normal UP и accepted >= live для каждого
слоя; accepted chunk сам по себе не означает final. Достаточно покрыть именно
видимый streamed prefix: неподтверждённого nonstreamed tail у observer не было.
Duplicate operation ACK не увеличивает accepted счётчик; permanent rejection
отправляет existing cancelled end и снимает ownership как раньше.

Packed v1 count проверяет version/base64/padding и считает байты без float decode
или allocations dab arrays; v1 — десять float32 полей. Неизвестное/повреждённое
кодирование и packet gap/dupe делают coverage неизвестным до явной отмены/разрыва.
Для старых операций dabs[] имеет приоритет перед dabsPacked, как strokeDabs.
Shared codec/protocol и таймеры не менялись. Лимит остался 128 жестов/socket;
полностью покрытые completed gestures уходят сразу. Согласованный bounded fallback:
при capacity pressure снимается только самый старый ENDED жест с explicit transient
cancel; активный held жест не вытесняется. Если все 128 active, сохраняется прежний
отказ нового live. Поэтому gap/unknown completed streams не блокируют live навсегда.
Каждый жест хранит не более 128 layer prefixes (общий максимум 16384/socket);
при overflow map очищается, ownership становится unknown без дальнейших layer entries.
Relay и accepted log при overflow не отбрасываются. Operation-before-first-live
консервативно сохраняет ended ownership до disconnect/pressure, без новых maps.

## Проверки

- Reproducer после UP + sibling остаётся: cancellation приходит только закрытому
  жесту, logical participant остаётся.
- Chunk-before-UP, final-before-UP, UP-before-final: после полного accepted prefix
  нет false cancellation при disconnect.
- Accepted prefix + обычный UP + duplicate operation ACK, final не пришёл:
  disconnect отменяет хвост, accepted prefix остаётся в log, sibling stream жив.
- 140 последовательных completed gestures проходят через 128-ID лимит без
  блокировки новых live packets и без лишних cancellations.
- Layer удалён после UP: late final получает target_gone, отменяется только
  transient хвост; accepted prefix сохранён, rejected final в log не попадает.
- Unit coverage: layers independent; malformed/unknown codec, padding, duplicate/
  gap sequence не дают ложного retirement; dabs[] precedence соблюдён.

Два целевых suites (реальный Socket.IO handler + private ownership): 67/67 PASS;
последний actual capacity-wire regression отдельно PASS: 129 ended streams автора
вызывают cancellation только самого старого, новый live проходит, held sibling не
затрагивается. Дополнительно 140 gapped completed gestures не блокируют capacity;
проверены all-active limit, layer overflow и operation-before-first-live fallback.
После final review добавлен runtime typeof guard на untrusted dabsPacked:
undefined/null/number не бросают исключение и сохраняют unknown ownership;
последний helper unit прогон 18/18 PASS. Server typecheck, oxlint --fix
изменённых файлов и git diff --check PASS. Широкие suites не запускались.
Исходный bounded-capacity test использует корректный packDabs([]), а не некорректный
пустой wire payload: неизвестный codec больше не считается доказанными нулём dabs.

GPU/browser, QA backend и интеграционные исходники не менялись. Test HTTP/client
закрываются в afterEach; зависимости заимствованы scoped links с shared source
текущего worktree. Собственные links/generated shared types/disposable QA config
после проверки удалены. Compact logs — ignored temp/qa792-evidence. Worktree
с исходниками сохраняется, постоянных сервисов не создавалось.
