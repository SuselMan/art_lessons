# Старый disposable cache747: audit и план закрытия

17.10.2026. Старый `puddle-747-native-gate-20261017`:196файлов/20,271,597байт (du21MiB). Marker/ID/path/nonce согласованы. TTL явно продлён только этому ресурсу на2ч:15:27:59→17:27:59, под registry flock/atomic replace; приватный ledger и SHA registry до/после в новом cache. Системная запись: linux-setup8adf094. Ничего не удалено.

Новый `puddle-747-active-20261017` содержит14fixture/auth с owner/disposable ledger.22исходных файла первых11fixture/auth проверены побайтно.32файла старого cache уже имели точные копии в новом; полный приватный inventory со SHA/relative paths сохранён там. Root и qa_cases подтвердили: текущие команды/Androidharness/RCA используют NEW, выбранный Intel forced-reference payload хранится в отдельном Intel cache. Старые пути в immutable docs — исторические ссылки, не активные runtime зависимости.

Уникальное ещё нужное перенесено выборочно с hash verification:

- `service-before.txt`908байт — предыдущая QA5384конфигурация для eventual снятия только собственного90dropin; NEW cleanup-previous-config/manifest.
- первый actualA4screen послеDry +его report/authorized-stop:526,633байта суммарно; NEW kept-historical-a4/copy-manifest.
- четыре old/current1024/1536goldenPNG уже побайтно присутствуют в Git compactproofs.

Остальное уникальное — прежние логи, intermediate QA observers/reports, cold/nameform diagnostics. Активного потребителя не найдено/не заявлено; основные выводы сохранены в Git compactproofs. Не копировались целиком dependencies/runtime/video/rawGPU dumps. До решения root старый каталог сохранён, чтобы не терять нерассмотренные исторические детали.

Конкретный finish: после принятия inventory/выбранных копий и проверки отсутствия active consumers выполнить штатный guarded `qa-cleanup.py finish puddle-747-native-gate-20261017`. При отказе из-за /proc visibility — тот же tool с sudo и затем восстановление владельца registry/lock; никаких manual-rm обходов. Это удалит только старый отмеченный disposable cache; backend комнаты, NEW cache, worktrees/исходники/Git историю не затрагивать.

NEW cache пока защищает текущую работу и auth14комнат. Перед его eventualfinish отдельно завершить тесты, ownerDELETE только этих disposable14fixture, закрыть собственные CDP/ADB/tunnel/serviceoverride ресурсы и сохранить итог. Автоматически забывать auth до удаления ownedbackendfixture нельзя. Чужие комнаты/профили/сервисы не трогать. RemoteVega cleanup остаётся UNKNOWN по ранее записанному ownerPID, не считать завершённым.
