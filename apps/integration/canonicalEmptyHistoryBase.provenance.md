# Полная DB история → исходный клиентский owner

Host-only smoke использует статические imports server transport, настоящего
source author/adapter/encoder и client room-state preparer. Синтетический mapped
soft descriptor явно валидируется и устанавливается в disposable BrushStorage;
это не доказательство поддержки native preset или физической DB.

Два кадра проходят BEGIN и durable recorded write через существующий receipt/
write queue. Query mock читает именно сохранённые indexed rows, проверяет terminal
empty ASC запрос; full-history owner выдаёт квитанцию, finish добавляет метаданные.
JSON roundtrip удаляет все внутренние ссылки перед prepareCanonicalRoomState.
Исходный client tail принимает assertEmptyHistoryBase; копия tail/receiver,
частичный suffix и истёкший lifetime отвергаются. Cut 0 также требует реального
вызова пустого query. Room/controller/route flags не меняются.

Проверки: `vitest run apps/integration/canonicalEmptyHistoryBase.test.ts
--maxWorkers=2`, `tsc -p apps/integration/tsconfig.json --noEmit`, oxlint.
Отдельный tsconfig не меняет server rootDir и проверяет статический совместный
граф в Bundler mode. Только erasableSyntaxOnly отключён: server использует
parameter properties, допустимые его штатным NodeNext compiler contract.
Временные каталоги BrushStorage удаляются afterEach после flush; сервисов нет.
Компактные логи: R52/canonical-baseline-cross-layer{,-tsc}.log.
