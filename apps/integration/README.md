---
layer: tooling
summary: проверки общих контрактов
tags: [vitest, canonical]
---
# integration — host-проверки общих контрактов

Статические тестовые импорты соединяют настоящий серверный read-owner и клиентский
preparer вне production TypeScript roots. Здесь нет runtime сервиса, второго
протокола или renderer. Query mocks сохраняют actual indexed write identity;
проверки не доказывают физическую долговечность PostgreSQL или работу устройства.

`canonicalEmptyHistoryBase.test.ts` проводит полный пустой baseline через JSON wire.
Отдельный `tsconfig.json` проверяет совместный статический граф без расширения
server rootDir. Детали доказательства и ограничения — в соседнем provenance.
