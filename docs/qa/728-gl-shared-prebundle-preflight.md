# Изолированная QA предсборка shared

Причина исследования: Surface получил HTML, но за 30 секунд не завершил импорт JS; 17 pending URL относились к shared/dist чужой рабочей копии. Это не доказательство HTTP/1, GPU или потери пакетов. Установленный Vite поддерживает HTTP/2 с HTTP/1 fallback; фактический протокол Chrome пока неизвестен.

Отдельная `vite.shared-qa.config.mts` работает только serve + mode qa-shared. Обе arms разрешают `@grafetto/shared` строго в `packages/shared/src/index.ts` выбранной рабочей копии. ON добавляет include; OFF оставляет обычное discovery. Product config и ручной стенд5381 не изменены; DEV=true, production=false, макросы не переопределены.

CPU preflight завершён: 27 исходников, ON metadata содержит выбранный source entry, OFF shared отсутствует. Реальная Vite transform `LayerRow.tsx` использует optimized shared только ON. Это доказательство локального маршрута импорта, не сетевого потребления Surface и не ускорения загрузки. Если браузер OFF всё-таки оптимизирует shared позже, сравнение признаётся недействительным.

`shared-prebundle-manifest.json` сохраняет абсолютную source authority, SHA всех27 inputs, lockfile/config/tool version и каждого optimized artifact включая metadata/chunks. Артефакты сохраняются до cleanup. Предсборка вызвана без слушающего сервера, комнаты, устройства и ввода; после проверки все Vite instances закрыты. App TS и fail-closed config test PASS.

Следующий разрешённый отдельно no-input gate: actual Network URL/protocol/finished и форма `/create`, OFF unbundled / ON optimized, DEV constructor query authority. Только после этого возможен повтор сравнения contact hoist. Никаких изменений маршрутизатора, туннеля, TLS или production semantics.

## ONE разрешённый no-input OFF/ON план

Последовательно два arms, одна собственная context в каждый момент. Fresh1700 MiB каждого arm, passive reclaim <=30s, active abort500 MiB, hard45s. Перед каждым запуском зарегистрировать отдельный cache/resource; rebuild selected config arm0/arm1 через mode qa-shared. Один temporary frontend5382, shared API4558, собственный forward9455; ручной5381 не трогать. После первого arm закрыть context/frontend, сохранить durable результат, finish ресурс. OFF timeout не отменяет разрешённый ON arm при новом fresh guard. Form submit/room/strokes отсутствуют.

Контроллер `navigation-surface-controller.mjs`: QA_NAVIGATION_ALLOCATED=1, QA_SHARED_ARM=0/1, QA_CACHE_ROOT=registered cache, QA_SOURCE_DIR=selected WT, QA_ROOM_BASE=own5382, GATE_OUT=новый private JSON. NODE_EXTRA_CA_CERTS=существующий mkcertCA. До CDP сравнить27 inputs, metadata arm, selected source, ON фактически отдаваемый bundle bytes/SHA. Browser trace сохраняет HTTP protocol/connection, import requests/pending и completeness. PASS требует OFF actual shared/src imports без optimized entry либо ON optimized request без source fanout, form1/noEngine. Если browser discovery меняет arm, INVALID, не ускорение. Результат частично сохранять даже при timeout, затем bounded owncontext close и process/registry cleanup. Без новых зависимостей или изменения production flags.
