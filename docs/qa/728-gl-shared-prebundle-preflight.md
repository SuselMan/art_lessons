# Изолированная QA предсборка shared

Причина исследования: Surface получил HTML, но за 30 секунд не завершил импорт JS; 17 pending URL относились к shared/dist чужой рабочей копии. Это не доказательство HTTP/1, GPU или потери пакетов. Установленный Vite поддерживает HTTP/2 с HTTP/1 fallback; фактический протокол Chrome пока неизвестен.

Отдельная `vite.shared-qa.config.mts` работает только serve + mode qa-shared. Обе arms разрешают `@grafetto/shared` строго в `packages/shared/src/index.ts` выбранной рабочей копии. ON добавляет include; OFF оставляет обычное discovery. Product config и ручной стенд5381 не изменены; DEV=true, production=false, макросы не переопределены.

CPU preflight завершён: 27 исходников, ON metadata содержит выбранный source entry, OFF shared отсутствует. Реальная Vite transform `LayerRow.tsx` использует optimized shared только ON. Это доказательство локального маршрута импорта, не сетевого потребления Surface и не ускорения загрузки. Если браузер OFF всё-таки оптимизирует shared позже, сравнение признаётся недействительным.

`shared-prebundle-manifest.json` сохраняет абсолютную source authority, SHA всех27 inputs, lockfile/config/tool version и каждого optimized artifact включая metadata/chunks. Артефакты сохраняются до cleanup. Предсборка вызвана без слушающего сервера, комнаты, устройства и ввода; после проверки все Vite instances закрыты. App TS и fail-closed config test PASS.

Следующий разрешённый отдельно no-input gate: actual Network URL/protocol/finished и форма `/create`, OFF unbundled / ON optimized, DEV constructor query authority. Только после этого возможен повтор сравнения contact hoist. Никаких изменений маршрутизатора, туннеля, TLS или production semantics.
