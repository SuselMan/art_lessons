# #773 — freeze не завершает разрешённый штрих ведущего

06.11.2026. База `cabb819391962c3186b9562fcd492a2b1dba51cd`.
Worktree `773-release-owner-freeze`, ветка `agents/773-release-owner-freeze`.

room_frozen_changed очищает только member streams: ведущему сервер по-прежнему
разрешает рисовать. Закрытие урока и индивидуальное блокирование сохраняют прежний
cleanup. Правила сервера и протокол не меняются.

## Регрессии

До: 1 FAIL / 16 unit-тестов, endPeerLiveStroke вызывается для owner.
После: 16 / 16 PASS, 3.61 с; owner-штрих не завершается и не вызывает resync,
а закрытие урока по-прежнему завершает owner/member и запрашивает восстановление.

Browser baseline на исходном roomControlEvents: FAIL (52.2 с), после UI freeze
наблюдатель завершил owner stream один раз вместо нуля; пиксель живого карандаша
до freeze уже существовал, канонической stroke ещё не было.

`e2e/specs/ownerFreeze.spec.ts` использует настоящий Grafetto, Socket.IO и PostgreSQL.
Один аутентифицированный Socket.IO-сокет ведущего отправляет packed live dabs без UP;
настоящий независимый наблюдатель рисует их в WebGL. Ведущий нажимает Freeze project
в UI. На наблюдателе проверяются пиксель framebuffer через pickColor, отсутствие
вызова endPeerLiveStroke и смены движка, отсутствие канонической stroke до UP.
Следующий packetSeq того же жеста должен дорисовать новую область при freeze.
После unfreeze, UP и принятой операции пиксели остаются, операция появляется в логе.

Матрица: pencil/marker × Chromium/SwiftShader и Samsung/Adreno650.
Это протокольный ввод на настоящем GPU, не физическое движение S Pen.

Историческое условие про live-owner-watercolor неприменимо к текущему main:
appendPeerLiveDabs намеренно не рисует watercolor-пакеты, только увеличивает
liveOffset; пиксели появляются через каноническую операцию (ADR011 §17.51).
Первые два watercolor browser cases ожидали отсутствующее live-превью и упали
до freeze. Они не считаются регрессией и не объявляются пройденными.
Общая ошибка касается разрешённого owner stream обычных инструментов, поэтому
она проверена на карандаше и маркере. Новая live-акварель сюда не добавляется:
экспериментальная модель исключена из первого релиза решением Ильи и #825.

Для общего Android CDP-кода выделен e2e/support/androidPage.ts; тело helper из
heldLiveTail перенесено без изменения поведения. Два прежних теста удерживаемого
хвоста выполняются в том же прогоне, включая реальный Samsung.

Полный Room + operationGate прогон: **699 / 699, 69 файлов, 89.99 с**.
Компактные логи/source SHA256/device passport находятся в игнорируемом
`temp/773-release-owner-freeze`. Собственные вкладки, runtime, PostgreSQL/volumes,
ADB forward/reverse и настройки питания/сна восстанавливаются после проверки.

Итог актуальной матрицы: **4 / 4 PASS, 121.1 с**. Два теста heldLiveTail после
выделения Android helper также PASS (Chromium 41.1 с, Samsung 50.5 с).
На Samsung darkness до/во время/после freeze: pencil 0.5856, marker 0.6824;
endPeerLiveStroke не вызывается до обычного UP, engine не заменяется.
Typecheck, финальный typecheck:e2e, lint:fix, map:check/map:rules: exit 0.
Собственные targets закрыты (проверено отсутствие URL порта6264); питание7 и
исходный Dozing восстановлены, forward29273/reverse6264 удалены.

Собственные runtime, три контейнера/volumes, trace/video и dependency views убраны.
