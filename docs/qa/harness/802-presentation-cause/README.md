# Зависимая GPU-работа и очередь показа Mini

QA-only инструменты для собственных вкладок Samsung. Hosted UI/движок не меняются. Нужен зарегистрированный приватный output, проверенный serial и foreground ChromeMain; CDP-forward19336. Cookie читается из приватного установленного access.json только в память.

```sh
node --test *.test.cjs
QA_OUTPUT=/private/out node run.cjs
QA_PHASE_SEAMS=1 QA_OUTPUT=/private/out node run.cjs
QA_SOLVER_POST=1 QA_DIRECT_COLOR=1 QA_OUTPUT=/private/out node run.cjs
QA_SCHEDULE8=1 QA_OUTPUT=/private/out node run.cjs
QA_FINAL_ONLY=1 QA_OUTPUT=/private/out node run.cjs
QA_SCHEDULE8=1 QA_BATCH_READBACK=1 QA_FINAL_ONLY=1 QA_OUTPUT=/private/out node run.cjs
QA_PER_OP=1 QA_SCHEDULE8=1 QA_BATCH_READBACK=1 QA_FINAL_ONLY=1 QA_OUTPUT=/private/out node run.cjs
QA_LOCAL_BUILD=/private/build QA_OUTPUT=/private/out node local-candidate.cjs
QA_FRONT_ORACLE=1 QA_ORACLE=1 QA_PATTERN=dot QA_LOCAL_BUILD=/private/build-front-oracle QA_OUTPUT=/private/out node local-candidate.cjs
```

У `run.cjs` опубликованные JS и unique anchors закреплены SHA; для chunk-патчей output должен содержать исходный chunk-3TO6NZCW.js. `local-candidate.cjs` перехватывает только собственные ответы allowlist локального manifest, проверяя каждый SHA; публичные файлы сохраняются. Oracle pattern: wave(default), dot, two-colors. SHA oracle сравнивает P/C/coverage одного target из того же raw source; это не whole-UI replay. Eight-ops sync-repeat проверяет разбиение ops, а не timer cancellation; отдельные тесты проверяют отмену таймера.

`gl.finish()` в Chrome155/revision3ff7… — **только Flush**; прежние короткие finish-вызовы не доказывали завершение GPU. Новые измерения читают4байта из валидного зависимого результата, восстанавливая FBO; это ожидание конкретного output point, не универсальный GPU finish и не чистое GPU elapsed.

Значительный остаток очереди находится до BackgroundMix. One-op профиль добавляет много validation/resolve/readback overhead: абсолютные суммы нельзя выдавать за обычную скорость GPU. Largest late groups — native water-front с несколькими draw на один op. Eight ops/timer без readback не ограничили GPU queue; с readback улучшили кадры ценой большей задержки цели. Gather specialization не показала выигрыша. Front-zero дал exactSHA на волне/точке/двух цветах и перспективный, но вариативный выигрыш; thermal/order квалификация сохранена в доказательствах. Полностью послегоальные RAF gap исключают интервалы, начинающиеся до goal.

`summarize-controls.cjs CACHE` формирует компактный итог. Полные счётчики приватны; исходные shader strings/raw GPU planes/системные трассы в Git не входят. Каждая вкладка закрывается в finally; bootstrap/ADB maps и зарегистрированный cache убирает оператор после завершения общей проверки.
