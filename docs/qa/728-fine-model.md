# Одобренный край Б в QA, 14.10.2026

Core495cfc7c8, standalone7c7f945b. Новая модель front8-fine-v1 маркируется
wc@front8-fine-v1 и имеет отдельную wash signature. front8-v1 и legacy сохраняют
прежний расчёт. Отключено только форсирование S2 малых мазков; native S2 больших
кистей и compact allocation сохранены. Prefix8/пигмент/кисть/Dryv2 сохранены.
Authoring включён только DEV QA5384; production authoring остаётся legacy.
Standalone5383: native-prefix8-fine-drytasks-v2, отдельный diagnosticFineTransport.

101unit, typecheck/lint, map:check/map:rules прошли:0errors, прежние warnings.
SwiftShader two-browser на VPS превысил180s, это неPASS. Headed Chrome ноутбука
AMD Radeon: peer/undo/redo/reentry/contextrestore maxDelta0/differentChannels0,
export386229bytes/snapshot1048596bytes/GL0. Первый аппаратный запуск потерял
комнату; повтор удерживал creator до конца. Старый scope literal копии harness
помечен как stale; launch configuration и renderer подтверждены отдельно.

Samsung сначала Dozing/unpowered: wake224 и Chrome без изменений настроек/PIN.
Собственная вкладка исчезла во время проверки, текущую комнату Ильи не меняли.
Read-only: visible/front8-fine-v1,8реальных fine stroke chunks, asyncErrornull/GL0.
Это не синтетический smoke и не физическая pen-to-pixel. Скорость широких мазков
на Samsung после точной сетки пока не доказана.

Все own Chrome contexts/SSH завершены, временные auth/input копии на ноутбуке
удалены, ADBforward19223 снят. Остаются2QAfrontend+1backend и cacheTTL для ночи.
Полная галерея не пересчитывалась. Push/production не выполнялись.
Compact report/renderer/одинPNG: runs/728-fine-model-2026-10-14/.
