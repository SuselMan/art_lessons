# Финальный CPU-аудит содержательности после4050

Только после завершения матрицы и сборки всех30закрытых карточек. GPU не нужен.
Срез первых5 `closed-first-five-audit.json` остаётся неизменяемым историческим
артефактом commit1c848018; финал пишет ДРУГОЙ файл с exclusive-create.

```
node docs/qa/prototypes/805-algorithm-search/closed-cell-audit.cjs \
  FROZEN_INPUT_ROOT MAIN_CACHE SERVED_FLOW_ROOT \
  docs/qa/runs/805-night-20261017/flow-20261018/gl/closed-final-thirty-audit.json all
```

Аргументы — существующий frozen30catalog, основной QA-cache, корень flow-галереи.
Приватные адреса/токены не нужны. Новые сервисы, зависимости или raw-копии не нужны.
Можно запускать с пониженным приоритетом CPU после завершения замеров.

Скрипт fail-closed до обработки картинок, пока нет30closed-scenes×135choices.
Существующий output НИКОГДА не перезаписывает. Проверены обе отрицательные
защиты на текущем незавершённом срезе:2PASS, без создания output.

Проверки: input6MiB/три SHA; binding preview→normalizedcell raw/PNG SHA;
rawgzip SHA/ограниченная4MiBраспаковка/decoded SHA; PNG decoded RGBA SHA.
Все134noninput outputs на каждой сцене группируются по carrier и PNG-пикселям,
а не только по сжатым файлам. Source fixtures не мутируются.

Особое внимание `native-flow-pool-drop`, `flow-pool-drop`,
`native-flow-separated-colors`, `flow-separated-colors`, `mini-two-colors`,
`dynamic-two-strokes`: итоговый focusScenes перечисляет доступные в этом audit.
На каждом output есть количество новых ненулевых/RGB-пикселей в исходно
чистом мокром множестве rawW>0 && rawRGBA==0, сумма ихalpha-кодов и доли от
этого множества. Знаменатель0 →null, не ложный0%. Дополнительно указаны
wet/material/wetmaterial counts и доля cleanwet от всей исходной воды.

Dry-only/water-only входят как ожидаемые identity/zero controls. Их совпадение
со входом НЕ классифицируется как неработающий solver. Exact-optimization
совпадения ожидаемы; цветовая/текстурная перемена без движения поддержки —
недостаточный результат. Появление1кода не доказывает заметное растекание,
смешение цветов или акварельную художественность. Это не art score и не mass
conservation audit. После расчёта нужны условия объяснения одинаковых групп,
как для24DSL→2 на прежних5сценах, а не автоматический вердикт «сломано».
