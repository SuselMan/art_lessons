# #728: normal Socket seed без рисования

## Причина изменения QA

Surface full47 `full47-1791387879` остановлен RAM guard до ordinary reader:
3454.99 → 361.785 MiB. Local append47 не доказывает сохранение47: readonly
Postgres проверка собственной комнаты дала только seq1–22. Одна страница,
но pool/cache/последний GL operator не сохранены; причина удержания памяти не доказана.
Повторять дорогой LOCAL GL seed для проверки загрузки не требуется.

## Проверенный seed

`socket-seed.mjs` допускает только HOME QA `http://127.0.0.1:4539` и явный grant.
Получает обычную guest identity через `/api/me`, использует normal Socket
`create_room` / `operation` с Cookie, без Engine/WebGL/DB bypass. Connection и ACK
ограничены15s, socket disconnect выполняется finally. Private auth создаётся
эксклюзивно с0600; cookies не возвращаются в отчёт и не входят в Git.

Один запуск: SSH handle9104, EXIT0. HOME raw:
`680-puddle-outline/temp/firstload-engine-free-47/seed-1791388857315/`.
`report.json` и `durable47.json` сохранены; private-auth.json остаётся приватным.
Room `d7c838a4-52f7-4b19-a0bc-e44b189eebad`, actual author
`8264efe0-51d7-4224-9b51-40f9dc4e788a`; UUID namespace
`53e5cfb6-8a6d-4a15-965d-fe1c0d6c85b1`.

Immutable input SHA256:
`dec30b3a6399c3835819b71fa651cd41f213394ff4bba6f51a7df30292ca1266`.
Original metadata Fine/#fdfdfc/1754×2480. Seq1–47 содержат41stroke,
3paper_dry,2operation_undo,1layer_clear. Меняются только operation.id,
targetOpId и userId; packed dabs/wet/color/preset/timestamps/strokeId/washId/layerId
сохранены. REST при живом Socket дал200,47 uniqueIDs, seq1–47 и глубокое точное
равенство mapped payload. JSON key order не является контрактом.

После disconnect snapshot index403 ожидаем: маршруты требуют live participant.
Это не доказывает отсутствие снимка. До обычного join status204 не заявляется.
Нет seedPNG, material parity, ускорения загрузки или GPU claim.

## CPU проверки и следующий oracle

Node syntax и `socket-seed.test.mjs` PASS. Проверены неизменность физического47,
key-order independence и отказ при missing op, duplicateID, wrong author/seq,
packed payload или target. Fixture задаётся QA_INPUT; default — сохранённый
KJc0OoVo/ops.json в680-device-qa-guards, отсутствующий файл означает отказ запуска.

Однокомнатная последовательность, одобрена root:
OFF47 ordinary → ON47 ordinary → ON Undo48 → independent OFF48 semantic replay
→ ON48 rejoin/Redo49 → actual snapshot49 → independent stored49.
Normal bakes подавлены до обеих ordinary47 и semantic48. Иначе OFF49 snapshot
незаметно превращает ON47 в bitmap restore. Максимум один Engine одновременно.
Cookie переносится только в собственный context; actual actor обязан совпадать.

Обязательные hardware guards: source6b/paper SHA, original metadata, server47
без snapshot, actual eligibility values,39→31 physical calls,10vs2 skipped IDs,
whole nonempty RGBA exact; durable48/49 prefix/author/type/target/IDs, meaningful
Undo delta и OFF48 oracle; Redo original47 exact; index49/blob200/nonempty и
stored49 paint0/whole exact. Пока все эти hardware gates pending.
