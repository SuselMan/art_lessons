# Surface native Room INIT-only

Контроллер создаёт и закрывает только собственный CDP target. Требует frozen
source manifest/head, paper manifest/runtime и актуальный app port5349/5350.
Устанавливает hooks перед Join click, пишет `QA_NATIVE_INIT` и настоящий
`[native-room-init]` через Runtime.consoleAPICalled сразу в report и JSONL.
Это переживает закрытие страницы; каждый SSH RAM probe сохраняется в timeline.

Перед запуском root выделяет Surface эксклюзивно. Передайте QA_APP, CDP_BASE,
QA_OUT (новая папка), QA_SOURCE, QA_RUNTIME, QA_MANIFEST, QA_PAPER_MANIFEST.
Для Node HTTP source verification используйте NODE_EXTRA_CA_CERTS с актуальным
публичным dev CA. Приватные адреса и raw в Git не входят.

`node docs/qa/harness/728-room-native-init/controller.mjs`

RAM preflight1700/abort500MiB; init-only watchdog120s. Нет pointer ввода,
GPU readback или дополнительных fences. Paper preload имеет observer effect;
результат не доказывает холодную загрузку, качество или устойчивую память.
Фикс нельзя использовать для повторения старого OOM baseline без отдельной команды.

Offline проверка: `node --test docs/qa/harness/728-room-native-init/init-events.test.mjs`.
