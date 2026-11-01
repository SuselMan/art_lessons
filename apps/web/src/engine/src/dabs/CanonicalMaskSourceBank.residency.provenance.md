# Ограниченная residency исходников отдельных корней

Проверяется механизм управления ресурсами исходных image-dabs. Это не новая
capability, серверная политика, формат кадра или обещание физического размера JS heap.
Исходный room/read/pin и авторитет операций проверяет прежний consumer.

## Контракт

- Старые constructor/full-bank/extension вызовы сохраняют прежнее поведение.
- Явный режим `root-residency` начинает с пустого плана. `prepareRoot` принимает
  уже нормализованные original asset/read callbacks и исходные native indexes.
  Одна незавершённая подготовка использует существующий `pending` slot.
- Скалярный проход считает фактические native pyramid levels, requirements и
  текущие активные строки. До массивов/maps выделяется lease существующего
  CPU owner; immutable capture повторно проверяет верхнюю оценку. Повторяющиеся
  inputs учитываются консервативно. Постоянный preflight stack покрывает базовая
  metadata reservation банка. Уровни не перенумеровываются и не ограничиваются
  новой эвристикой LOD.
- Используются прежние planner/upload/CPU mip cache, ключи и `leaseRequired` того
  же GPU cache. Сохраняются лимиты 4096 jobs, 256 crops, CPU/GPU и texture bounds.
  В готовности нового корня не участвуют несвязанные уровни других корней.
- `assertPreparedPublication` заранее строит maps/membership snapshot;
  `publish` проверяет identities и выполняет только публикацию. Staged membership
  copy заряжена CPU owner; `finalizeCleanup` освобождает её после общей публикации.
  Отмена до публикации откатывает candidate; после публикации подготовка уже не
  владеет lease и `cancel` не отзывает ресурс consumer.
- Lifetime/refcounts хранятся в существующих job/input rows. Нет второго cache,
  очереди или глобального реестра корней. Последний handle удаляет строки/readers
  и снимает pin. Освободившиеся texture entries остаются у ограниченного общего
  LRU cache: это не утверждение немедленного физического освобождения GPU памяти.
- `retain` выделяет только CPU metadata (2048 bytes для child handle), повторно
  проверяет исходный handle после reserve и добавляет membership. Shared native
  source pin/readers живут до последнего handle. Нет GL/cache readiness queries,
  чтения пикселей или нового source grant внутри `retain`.
- Group/preparation metadata заряжена 4096 bytes плюс конечные job/union rows.
  Каждый fork имеет собственный CPU charge; reset обходит существующие row
  memberships и attempt-all освобождает parent/children и pending candidate.
  Generation и resetting guard закрывают reentry; поздний release идемпотентен.
- Coordinator принимает one-shot `sourceLease` при возврате source callback;
  ошибка после handoff освобождает lease. OPEN Entry держит reader между кадрами.
  После END/close, stable commit и снятия raw ownership lease освобождается;
  cancel также освобождает его. Выбранный author может хранить parent preparation,
  выдавая отдельный `retain` каждому Entry. Executor получает узкий reader.

## Проверки

Новые focused tests потребляют действительные original attachment/lifetime
объекты через Coordinator и настоящий FrameExecutor с recording GL. Это unit
проверки владельцев и загружаемых bytes, не аппаратная проверка WebGL.

Покрыты:

- selected native-level RGBA bytes равны прежнему full-bank upload;
- более 75 последовательно завершённых корней при одном OPEN: прежние texture
  identities, возврат активных строк/CPU reservations к исходному уровню;
- shared CAS/native keys, release во время pending preparation без resurrection;
- publication CAS после изменения job/membership, включая замену child при
  неизменных количестве и job array;
- cancellation/read failure/budget/loss/stale reset, getters rejected;
- bounded reentrant jobs и cancellation из original reader callback;
- маленький root помещается в CPU budget 96 KiB без fixed-4096 reservation;
- child fork без cache.get/GL query, независимые parent/OPEN child,
  reset всех children и reserve-callback retirement rollback;
- два завершённых Coordinator цикла используют одну selected preparation с
  разными per-gesture children; после первого parent остаётся готовым;
- handoff failure после source callback, OPEN cancellation, stable completion.

Первоначальный RED: 4/4 новых bank tests отклонялись старым constructor без режима
и API. При широком прогоне обнаружен собственный регресс: новая attempt-all ветка
ошибочно повторно выбрасывала историческую candidate-cleanup диагностику.
Исправление учитывает только ошибки текущего commit cleanup; исходный meaningful
Executor тест оставлен без изменения. Отдельный тестовый spy сначала предполагал,
что recordingGL.getParameter уже mock; исправлен установкой наблюдателя, закон
производственного кода не менялся.

Финальные focused/legacy: **239 tests / 9 suites PASS**, maxWorkers=1.
Лог: `temp/device-runs/krita-stroke-20261024/fixes-v52/ls2-bank-final-tests.log`.
Targeted typecheck: exit 2, только три ожидаемых missing indexed exports
`CanonicalIndexedRootV1` / `CanonicalIndexedRoomGeometry` из старого shared DIST
в соседнем WIP CanonicalRecordedDelivery.ts; собственных ошибок нет. Это не
общий PASS: shared/indexed integration gate принадлежит root.
Lint: exit 0, ошибок и предупреждений нет. Логи: `ls2-bank-target.log`,
`ls2-bank-lint.log`.
Индексный streaming consumer, серверные session limits и runtime активация в этот
leaf не входят. Устройство, сервисы, сборки и зависимости не запускались.
