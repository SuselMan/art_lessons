# Отдельные браузерные и API-сценарии

152 самостоятельных определения из 180 E2E-вариантов; повторения одного алгоритма с материалами/фильтрами/числом участников собраны как варианты одного кейса. Старые QA-001…024 и QA-101…114 остаются обзорными группами, не прибавляются к числу независимых проверок.

Все сценарии используют [подготовку](execution.md). Для каждого ниже команда указывает точное объявление теста, а не целый файл. Параметризованные варианты запускать все; `--list` только проверяет выбор. На SHA baseline условия читаются из сохранённого исходника; при движении строк сверить registry и discovery. Статус на новом кандидате NOT RUN.

<a id="qa-201"></a>

## QA-201 — Каждый материал онлайн

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Двумя авторами нанести мазки выбранным материалом, Undo/Redo автора, reload и late join.

**Ожидание:** У наблюдателя и после replay сохранён тот же материал без чужой отмены; повторить девять указанных вариантов.

**Автоматизация:** [e2e/specs/allToolsCollaboration.spec.ts:14](../../../e2e/specs/allToolsCollaboration.spec.ts); `npx playwright test e2e/specs/allToolsCollaboration.spec.ts:14 --project=chromium`. Группа: [QA-003](../scenarios/collaboration.md#qa-003).

**Точные варианты:**

- `pencil: live peer, undo/redo and history replay retain the mark`
- `charcoal: live peer, undo/redo and history replay retain the mark`
- `liner: live peer, undo/redo and history replay retain the mark`
- `marker: live peer, undo/redo and history replay retain the mark`
- `brushPen: live peer, undo/redo and history replay retain the mark`
- `digitalBrush: live peer, undo/redo and history replay retain the mark`
- `eraser: live peer, undo/redo and history replay retain the mark`
- `smudge: live peer, undo/redo and history replay retain the mark`
- `watercolor: live peer, undo/redo and history replay retain the mark`

<a id="qa-202"></a>

## QA-202 — Вход по ссылке review

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть preview link, войти в аннотации и вернуться к рисованию.

**Ожидание:** Режим включён один раз, возврат доступен и не теряет рисунок.

**Автоматизация:** [e2e/specs/annotations.spec.ts:34](../../../e2e/specs/annotations.spec.ts); `npx playwright test e2e/specs/annotations.spec.ts:34 --project=chromium`. Группа: [QA-113](interface.md#qa-113).

**Точные варианты:**

- `preview links enter annotation mode once and allow returning to drawing`

<a id="qa-203"></a>

## QA-203 — Перо аннотаций

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Нарисовать пометку поверх готового рисунка.

**Ожидание:** Пометка записана отдельной операцией, исходный рисунок не изменился.

**Автоматизация:** [e2e/specs/annotations.spec.ts:56](../../../e2e/specs/annotations.spec.ts); `npx playwright test e2e/specs/annotations.spec.ts:56 --project=chromium`. Группа: [QA-113](interface.md#qa-113).

**Точные варианты:**

- `the annotation pen records a mark, and leaves the drawing alone`

<a id="qa-204"></a>

## QA-204 — Текстовая аннотация

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Тапнуть текстовым инструментом, набрать текст, нажать Ctrl+Enter.

**Ожидание:** Редактор открыт в точке тапа, текст сохранён как аннотация.

**Автоматизация:** [e2e/specs/annotations.spec.ts:71](../../../e2e/specs/annotations.spec.ts); `npx playwright test e2e/specs/annotations.spec.ts:71 --project=chromium`. Группа: [QA-113](interface.md#qa-113).

**Точные варианты:**

- `a text note opens on a tap, takes typing, and is recorded on Ctrl+Enter`

<a id="qa-205"></a>

## QA-205 — Ластик аннотаций

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Провести annotation eraser через существующую пометку.

**Ожидание:** Пометка удалена, слой рисунка сохранён.

**Автоматизация:** [e2e/specs/annotations.spec.ts:92](../../../e2e/specs/annotations.spec.ts); `npx playwright test e2e/specs/annotations.spec.ts:92 --project=chromium`. Группа: [QA-113](interface.md#qa-113).

**Точные варианты:**

- `the annotation eraser removes a mark by dragging across it`

<a id="qa-206"></a>

## QA-206 — Камера после создания доски

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Создать вторую доску, переключиться, изменить zoom и угол.

**Ожидание:** Холст действительно перерисован под новой камерой, а не только изменены числа.

**Автоматизация:** [e2e/specs/boardCamera.spec.ts:14](../../../e2e/specs/boardCamera.spec.ts); `npx playwright test e2e/specs/boardCamera.spec.ts:14 --project=chromium`. Группа: [QA-109](interface.md#qa-109).

**Точные варианты:**

- `zoom and rotation redraw the canvas after creating and switching boards (#715)`

<a id="qa-207"></a>

## QA-207 — Следование по доскам

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Учитель меняет доски, ученик следует, затем выбирает доску сам; reload и удаление выбранной доски.

**Ожидание:** Рисунки досок изолированы; режим следования и возврат к доступной доске корректны.

**Автоматизация:** [e2e/specs/boards.spec.ts:116](../../../e2e/specs/boards.spec.ts); `npx playwright test e2e/specs/boards.spec.ts:116 --project=chromium`. Группа: [QA-109](interface.md#qa-109).

**Точные варианты:**

- `the teacher turns pages, the student follows, and both boards keep their ink`

<a id="qa-208"></a>

## QA-208 — Цикл работы в классе

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Раздать работу, рисовать, обойти доски учеников, показать одну всем, вернуть класс и разослать обратно.

**Ожидание:** Учитель и ученики получают нужные доски, свои рисунки сохраняются.

**Автоматизация:** [e2e/specs/classMode.spec.ts:97](../../../e2e/specs/classMode.spec.ts); `npx playwright test e2e/specs/classMode.spec.ts:97 --project=chromium`. Группа: [QA-110](interface.md#qa-110).

**Точные варианты:**

- `hand out, draw, walk the class, show one to all, call everyone back and send them back`

<a id="qa-209"></a>

## QA-209 — Paste после закрытия рамки

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Скопировать фрагмент на другой слой, перетащить и закрыть gizmo.

**Ожидание:** Фрагмент остаётся виден после commit.

**Автоматизация:** [e2e/specs/clipboardAcrossRooms.spec.ts:90](../../../e2e/specs/clipboardAcrossRooms.spec.ts); `npx playwright test e2e/specs/clipboardAcrossRooms.spec.ts:90 --project=chromium`. Группа: [QA-104](interface.md#qa-104).

**Точные варианты:**

- `a piece copied onto another layer stays visible after dragging and closing its gizmo (#714)`

<a id="qa-210"></a>

## QA-210 — Paste в другую комнату

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Скопировать фрагмент, открыть другую комнату с другой камерой, вставить.

**Ожидание:** Фрагмент появляется перед текущим пользователем.

**Автоматизация:** [e2e/specs/clipboardAcrossRooms.spec.ts:141](../../../e2e/specs/clipboardAcrossRooms.spec.ts); `npx playwright test e2e/specs/clipboardAcrossRooms.spec.ts:141 --project=chromium`. Группа: [QA-104](interface.md#qa-104).

**Точные варианты:**

- `a piece copied in one room pastes into another, in front of the person`

<a id="qa-211"></a>

## QA-211 — Paste в исходную комнату

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Скопировать фрагмент и вставить в той же комнате.

**Ожидание:** Фрагмент возвращается на исходные координаты.

**Автоматизация:** [e2e/specs/clipboardAcrossRooms.spec.ts:175](../../../e2e/specs/clipboardAcrossRooms.spec.ts); `npx playwright test e2e/specs/clipboardAcrossRooms.spec.ts:175 --project=chromium`. Группа: [QA-104](interface.md#qa-104).

**Точные варианты:**

- `a paste inside its own room still lands exactly where it was copied`

<a id="qa-212"></a>

## QA-212 — Clipboard в уже открытой вкладке

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть две комнаты, скопировать в первой и вставить во второй без reload.

**Ожидание:** Открытая вкладка видит новый clipboard.

**Автоматизация:** [e2e/specs/clipboardAcrossRooms.spec.ts:189](../../../e2e/specs/clipboardAcrossRooms.spec.ts); `npx playwright test e2e/specs/clipboardAcrossRooms.spec.ts:189 --project=chromium`. Группа: [QA-104](interface.md#qa-104).

**Точные варианты:**

- `a copy in one tab is pasteable in a room already open in another`

<a id="qa-213"></a>

## QA-213 — Сходимость при росте участников

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Одновременно рисовать и выполнять авторские Undo/Redo в комнатах на 2/5/10/20 участников.

**Ожидание:** Журнал и итог сходятся для каждого размера; сетевые identities и renderer считать отдельно.

**Автоматизация:** [e2e/specs/collaborationMatrix.spec.ts:21](../../../e2e/specs/collaborationMatrix.spec.ts); `npx playwright test e2e/specs/collaborationMatrix.spec.ts:21 --project=chromium`. Группа: [QA-017](../scenarios/collaboration.md#qa-017).

**Точные варианты:**

- `2 participants converge after simultaneous strokes and author undo/redo`
- `5 participants converge after simultaneous strokes and author undo/redo`
- `10 participants converge after simultaneous strokes and author undo/redo`
- `20 participants converge after simultaneous strokes and author undo/redo`

<a id="qa-214"></a>

## QA-214 — Разные материалы одновременно

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Нескольким авторам пересечь общий seed разными материалами, затем Undo/Redo.

**Ожидание:** Порядок и пиксели сходятся; наборы материалов перечислены среди вариантов.

**Автоматизация:** [e2e/specs/collaborationMatrix.spec.ts:86](../../../e2e/specs/collaborationMatrix.spec.ts); `npx playwright test e2e/specs/collaborationMatrix.spec.ts:86 --project=chromium`. Группа: [QA-017](../scenarios/collaboration.md#qa-017).

**Точные варианты:**

- `5 mixed-tool authors (pencil, marker, watercolor, eraser, smudge) converge after drawing and undo/redo`
- `2 mixed-tool authors (pencil, marker) converge after drawing and undo/redo`
- `2 mixed-tool authors (watercolor, eraser) converge after drawing and undo/redo`
- `2 mixed-tool authors (watercolor, smudge) converge after drawing and undo/redo`

<a id="qa-215"></a>

## QA-215 — Цвет из палитры

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Выбрать цвет кнопкой палитры на рейке и нарисовать.

**Ожидание:** Новый штрих имеет выбранный цвет.

**Автоматизация:** [e2e/specs/colorWell.spec.ts:39](../../../e2e/specs/colorWell.spec.ts); `npx playwright test e2e/specs/colorWell.spec.ts:39 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `a palette colour from the rail is the colour the next stroke is drawn in`

<a id="qa-216"></a>

## QA-216 — Цвет при активном ластике

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Взять ластик, изменить цвет, вернуться к карандашу и рисовать.

**Ожидание:** Изменён цвет карандаша, ластик не получает фиктивного цвета.

**Автоматизация:** [e2e/specs/colorWell.spec.ts:57](../../../e2e/specs/colorWell.spec.ts); `npx playwright test e2e/specs/colorWell.spec.ts:57 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `with the eraser in hand the well edits the pencil’s colour`

<a id="qa-217"></a>

## QA-217 — Цвет выключенной заливки фигуры

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Выключить fill фигуры, выбрать его цвет, затем swap fill/stroke.

**Ожидание:** Выбор включает fill, swap меняет обе стороны согласованно.

**Автоматизация:** [e2e/specs/colorWell.spec.ts:68](../../../e2e/specs/colorWell.spec.ts); `npx playwright test e2e/specs/colorWell.spec.ts:68 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `for a shape: choosing a colour for a switched-off fill switches it on, and swap trades both`

<a id="qa-218"></a>

## QA-218 — Цвет в общей палитре

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Добавить текущий цвет в палитру комнаты.

**Ожидание:** Цвет попал в общее состояние, а не только локальный flyout.

**Автоматизация:** [e2e/specs/colorWell.spec.ts:96](../../../e2e/specs/colorWell.spec.ts); `npx playwright test e2e/specs/colorWell.spec.ts:96 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `adding the current colour to the palette reaches the room`

<a id="qa-219"></a>

## QA-219 — Открытие и закрытие color well

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Дважды нажать цветовой well.

**Ожидание:** Flyout открывается и закрывается, доступное состояние переключателя соответствует факту.

**Автоматизация:** [e2e/specs/colorWell.spec.ts:110](../../../e2e/specs/colorWell.spec.ts); `npx playwright test e2e/specs/colorWell.spec.ts:110 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `the well toggles its flyout and says so`

<a id="qa-220"></a>

## QA-220 — Пиксели после GPU restore

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Нарисовать, снять actual, потерять WebGL context, восстановить.

**Ожидание:** Рисунок восстановлен пиксельно, GL context готов.

**Автоматизация:** [e2e/specs/contextLoss.spec.ts:28](../../../e2e/specs/contextLoss.spec.ts); `npx playwright test e2e/specs/contextLoss.spec.ts:28 --project=chromium`. Группа: [QA-012](../scenarios/collaboration.md#qa-012).

**Точные варианты:**

- `the drawing comes back, pixel for pixel`

<a id="qa-221"></a>

## QA-221 — Undo после GPU restore

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Нарисовать два штриха, потерять и восстановить context, выполнить Undo.

**Ожидание:** Отменяется нужный штрих, предыдущий сохранён.

**Автоматизация:** [e2e/specs/contextLoss.spec.ts:65](../../../e2e/specs/contextLoss.spec.ts); `npx playwright test e2e/specs/contextLoss.spec.ts:65 --project=chromium`. Группа: [QA-012](../scenarios/collaboration.md#qa-012).

**Точные варианты:**

- `undo still knows what it was going to undo`

<a id="qa-222"></a>

## QA-222 — Жест прерван потерей GPU

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Начать жест и потерять context до UP; восстановить.

**Ожидание:** Незавершённый след не записан и не остаётся призраком.

**Автоматизация:** [e2e/specs/contextLoss.spec.ts:102](../../../e2e/specs/contextLoss.spec.ts); `npx playwright test e2e/specs/contextLoss.spec.ts:102 --project=chromium`. Группа: [QA-012](../scenarios/collaboration.md#qa-012).

**Точные варианты:**

- `a gesture interrupted by the loss leaves nothing behind`

<a id="qa-223"></a>

## QA-223 — Входящий штрих во время GPU loss

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Во время входящего peer stroke потерять context и восстановить.

**Ожидание:** Участник не остаётся с половиной принятого штриха.

**Автоматизация:** [e2e/specs/contextLoss.spec.ts:149](../../../e2e/specs/contextLoss.spec.ts); `npx playwright test e2e/specs/contextLoss.spec.ts:149 --project=chromium`. Группа: [QA-012](../scenarios/collaboration.md#qa-012).

**Точные варианты:**

- `a peer stroke in flight is not left half-drawn`

<a id="qa-224"></a>

## QA-224 — Жёсткость цифровой кисти

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Сравнить край одинаковых мазков при разных hardness и размерах.

**Ожидание:** Край действительно меняется и масштабируется с кистью.

**Автоматизация:** [e2e/specs/digitalBrush.spec.ts:46](../../../e2e/specs/digitalBrush.spec.ts); `npx playwright test e2e/specs/digitalBrush.spec.ts:46 --project=chromium`. Группа: [QA-103](interface.md#qa-103).

**Точные варианты:**

- `hardness genuinely changes the edge, and it scales with the mark`

<a id="qa-225"></a>

## QA-225 — Opacity цифровой кисти

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Нанести перекрывающиеся dabs внутри одного мазка с заданной opacity.

**Ожидание:** Итоговая непрозрачность соответствует настройке, не сумме повторных нанесений.

**Автоматизация:** [e2e/specs/digitalBrush.spec.ts:107](../../../e2e/specs/digitalBrush.spec.ts); `npx playwright test e2e/specs/digitalBrush.spec.ts:107 --project=chromium`. Группа: [QA-103](interface.md#qa-103).

**Точные варианты:**

- `paints at the opacity it was asked for, not at whatever the dabs sum to`

<a id="qa-226"></a>

## QA-226 — Первый штрих

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть новую комнату и нарисовать.

**Ожидание:** Есть видимые чернила и соответствующая операция журнала.

**Автоматизация:** [e2e/specs/draw.spec.ts:12](../../../e2e/specs/draw.spec.ts); `npx playwright test e2e/specs/draw.spec.ts:12 --project=chromium`. Группа: [QA-001](../scenarios/collaboration.md#qa-001).

**Точные варианты:**

- `the stroke lands on the canvas and in the log`

<a id="qa-227"></a>

## QA-227 — Второй штрих

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** После первого штриха добавить второй в другом месте.

**Ожидание:** Оба штриха сохранены, первый не заменён вторым.

**Автоматизация:** [e2e/specs/draw.spec.ts:38](../../../e2e/specs/draw.spec.ts); `npx playwright test e2e/specs/draw.spec.ts:38 --project=chromium`. Группа: [QA-001](../scenarios/collaboration.md#qa-001).

**Точные варианты:**

- `a second stroke adds to the first rather than replacing it`

<a id="qa-228"></a>

## QA-228 — Сквозной ластик и Undo

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Нарисовать на двух слоях, одним жестом стереть оба в through-layers, Undo.

**Ожидание:** Один жест затрагивает оба слоя и один Undo возвращает оба.

**Автоматизация:** [e2e/specs/eraseThroughLayers.spec.ts:101](../../../e2e/specs/eraseThroughLayers.spec.ts); `npx playwright test e2e/specs/eraseThroughLayers.spec.ts:101 --project=chromium`. Группа: [QA-107](interface.md#qa-107).

**Точные варианты:**

- `one pass clears both layers, and one undo brings both back`

<a id="qa-229"></a>

## QA-229 — Хоткей сквозного ластика

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Выключить постоянный through-layers toggle, нажать Shift+E.

**Ожидание:** Выбран сквозной ластик, постоянная настройка не перезаписана.

**Автоматизация:** [e2e/specs/eraseThroughLayers.spec.ts:144](../../../e2e/specs/eraseThroughLayers.spec.ts); `npx playwright test e2e/specs/eraseThroughLayers.spec.ts:144 --project=chromium`. Группа: [QA-107](interface.md#qa-107).

**Точные варианты:**

- `Shift+E takes the through-layers eraser without touching the switch`

<a id="qa-230"></a>

## QA-230 — Обычный ластик

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** При выключенном through-layers стереть в области двух слоёв.

**Ожидание:** Меняется только активный слой.

**Автоматизация:** [e2e/specs/eraseThroughLayers.spec.ts:174](../../../e2e/specs/eraseThroughLayers.spec.ts); `npx playwright test e2e/specs/eraseThroughLayers.spec.ts:174 --project=chromium`. Группа: [QA-107](interface.md#qa-107).

**Точные варианты:**

- `with the toggle off it stays on the active layer`

<a id="qa-231"></a>

## QA-231 — Пипетка возвращает инструмент

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Взять цвет нарисованной области пипеткой и провести карандашом.

**Ожидание:** Цвет взят из правильной точки, карандаш снова активен.

**Автоматизация:** [e2e/specs/eyedropper.spec.ts:14](../../../e2e/specs/eyedropper.spec.ts); `npx playwright test e2e/specs/eyedropper.spec.ts:14 --project=chromium`. Группа: [QA-106](interface.md#qa-106).

**Точные варианты:**

- `the eyedropper takes the colour under the pointer and hands the pencil back`

<a id="qa-232"></a>

## QA-232 — Заливка замкнутой области

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Нарисовать контур и тапнуть внутри fill.

**Ожидание:** Заполнена нужная область активного слоя, fill записан в журнал.

**Автоматизация:** [e2e/specs/fill.spec.ts:51](../../../e2e/specs/fill.spec.ts); `npx playwright test e2e/specs/fill.spec.ts:51 --project=chromium`. Группа: [QA-103](interface.md#qa-103).

**Точные варианты:**

- `a tap inside an outline fills it on the active layer, and the fill is recorded`

<a id="qa-233"></a>

## QA-233 — Заливка заблокированного слоя

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Заблокировать слой и тапнуть fill.

**Ожидание:** Нет изменения пикселей и лишней операции/работы.

**Автоматизация:** [e2e/specs/fill.spec.ts:67](../../../e2e/specs/fill.spec.ts); `npx playwright test e2e/specs/fill.spec.ts:67 --project=chromium`. Группа: [QA-103](interface.md#qa-103).

**Точные варианты:**

- `a locked layer refuses the tap before any work is done`

<a id="qa-234"></a>

## QA-234 — Заливка в нижней части листа

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Создать замкнутую область внизу A4 и залить.

**Ожидание:** Нижние тайлы доступны, заливка не ограничена верхним тайлом.

**Автоматизация:** [e2e/specs/fill.spec.ts:89](../../../e2e/specs/fill.spec.ts); `npx playwright test e2e/specs/fill.spec.ts:89 --project=chromium`. Группа: [QA-103](interface.md#qa-103).

**Точные варианты:**

- `a tap low on the sheet fills too`

<a id="qa-235"></a>

## QA-235 — Волосная линия гибкой кисти

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Выбрать крупный flexible tip, провести с feather pressure0.02.

**Ожидание:** Перо/акварель дают тонкую видимую линию; сомнительный watercolor oracle709 отмечать отдельно.

**Автоматизация:** [e2e/specs/flexibleHairline.spec.ts:7](../../../e2e/specs/flexibleHairline.spec.ts); `npx playwright test e2e/specs/flexibleHairline.spec.ts:7 --project=chromium`. Группа: [QA-017](../scenarios/collaboration.md#qa-017).

**Точные варианты:**

- `brushPen: a large flexible nib draws a hairline with feather pressure`
- `watercolor: a large flexible nib draws a hairline with feather pressure`

<a id="qa-236"></a>

## QA-236 — Тап с дрейфом по панели

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Нажать кнопку и немного сдвинуть перо до UP.

**Ожидание:** Выполнено действие кнопки, панель не сместилась.

**Автоматизация:** [e2e/specs/floatingPanel.spec.ts:79](../../../e2e/specs/floatingPanel.spec.ts); `npx playwright test e2e/specs/floatingPanel.spec.ts:79 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `a small drift still presses the button and leaves the panel where it was`

<a id="qa-237"></a>

## QA-237 — Перетаскивание за пределы кнопки

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Нажать кнопку и протянуть палец/перо далеко за её пределы.

**Ожидание:** Панель перемещена, действие кнопки не выполнено.

**Автоматизация:** [e2e/specs/floatingPanel.spec.ts:98](../../../e2e/specs/floatingPanel.spec.ts); `npx playwright test e2e/specs/floatingPanel.spec.ts:98 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `a press that travels off the button drags the panel and does not press it`

<a id="qa-238"></a>

## QA-238 — Drag тела панели

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Потянуть свободную область панели.

**Ожидание:** Перемещение начинается сразу, лишних нажатий нет.

**Автоматизация:** [e2e/specs/floatingPanel.spec.ts:118](../../../e2e/specs/floatingPanel.spec.ts); `npx playwright test e2e/specs/floatingPanel.spec.ts:118 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `a press on the panel body drags it from the first pixels`

<a id="qa-239"></a>

## QA-239 — Тап пустого слота

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Коротко тапнуть незаполненный слот.

**Ожидание:** Выбор инструмента не открывается.

**Автоматизация:** [e2e/specs/floatingPanel.spec.ts:162](../../../e2e/specs/floatingPanel.spec.ts); `npx playwright test e2e/specs/floatingPanel.spec.ts:162 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `a tap on it opens nothing`

<a id="qa-240"></a>

## QA-240 — Hold пустого слота

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Удержать незаполненный слот.

**Ожидание:** Открыт chooser назначения слота.

**Автоматизация:** [e2e/specs/floatingPanel.spec.ts:178](../../../e2e/specs/floatingPanel.spec.ts); `npx playwright test e2e/specs/floatingPanel.spec.ts:178 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `a hold on it opens its chooser`

<a id="qa-241"></a>

## QA-241 — Начальная раскладка панели

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть профиль без сохранённой раскладки.

**Ожидание:** Четыре прежние кнопки и четыре пустых слота на месте.

**Автоматизация:** [e2e/specs/floatingPanelSlots.spec.ts:56](../../../e2e/specs/floatingPanelSlots.spec.ts); `npx playwright test e2e/specs/floatingPanelSlots.spec.ts:56 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `opens with the four-button panel it has always had, plus four empty slots`

<a id="qa-242"></a>

## QA-242 — Состав chooser слота

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Удержать пустой слот и просмотреть список.

**Ожидание:** Предложены инструменты, обе группы, Undo/Redo и очистка слота.

**Автоматизация:** [e2e/specs/floatingPanelSlots.spec.ts:74](../../../e2e/specs/floatingPanelSlots.spec.ts); `npx playwright test e2e/specs/floatingPanelSlots.spec.ts:74 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `holding an empty slot offers every tool, both groups, undo/redo and “leave empty”`

<a id="qa-243"></a>

## QA-243 — Назначение инструмента слоту

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Удержать слот и выбрать конкретный инструмент.

**Ожидание:** Инструмент назначен и взят в руку.

**Автоматизация:** [e2e/specs/floatingPanelSlots.spec.ts:97](../../../e2e/specs/floatingPanelSlots.spec.ts); `npx playwright test e2e/specs/floatingPanelSlots.spec.ts:97 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `puts the chosen tool in the slot and takes it in hand`

<a id="qa-244"></a>

## QA-244 — Перенос назначения

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Назначить уже занятый инструмент другому слоту.

**Ожидание:** Новое место заполнено, прежнее очищено, дубликата нет.

**Автоматизация:** [e2e/specs/floatingPanelSlots.spec.ts:113](../../../e2e/specs/floatingPanelSlots.spec.ts); `npx playwright test e2e/specs/floatingPanelSlots.spec.ts:113 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `moving something to a new slot empties the one it came from`

<a id="qa-245"></a>

## QA-245 — Очистка слота

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** У занятого слота выбрать leave empty.

**Ожидание:** Слот пустой и не действует как прежняя кнопка.

**Автоматизация:** [e2e/specs/floatingPanelSlots.spec.ts:125](../../../e2e/specs/floatingPanelSlots.spec.ts); `npx playwright test e2e/specs/floatingPanelSlots.spec.ts:125 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `“leave empty” takes the tool back out`

<a id="qa-246"></a>

## QA-246 — Группа следует внешнему выбору

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Настроить group slot, выбрать материал через другую панель.

**Ожидание:** Слот отражает последний выбранный материал.

**Автоматизация:** [e2e/specs/floatingPanelSlots.spec.ts:139](../../../e2e/specs/floatingPanelSlots.spec.ts); `npx playwright test e2e/specs/floatingPanelSlots.spec.ts:139 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `a group slot follows whatever was last picked elsewhere`

<a id="qa-247"></a>

## QA-247 — Повторный тап группы

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Дважды нажать group slot, выбрать ранее не использованный материал.

**Ожидание:** Chooser доступен, новый материал можно взять без предварительного выбора в другом месте.

**Автоматизация:** [e2e/specs/floatingPanelSlots.spec.ts:155](../../../e2e/specs/floatingPanelSlots.spec.ts); `npx playwright test e2e/specs/floatingPanelSlots.spec.ts:155 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `a second tap on a group slot reaches a material never picked before`

<a id="qa-248"></a>

## QA-248 — Hold группы меняет слот

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Удержать настроенный group slot.

**Ожидание:** Открыта настройка слота, а не ошибочно выбор материала группы.

**Автоматизация:** [e2e/specs/floatingPanelSlots.spec.ts:186](../../../e2e/specs/floatingPanelSlots.spec.ts); `npx playwright test e2e/specs/floatingPanelSlots.spec.ts:186 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `holding a group slot still offers to change the slot, not the material`

<a id="qa-249"></a>

## QA-249 — Тап действует без chooser

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Коротко нажать настроенный слот.

**Ожидание:** Выполнена его команда, chooser не появился.

**Автоматизация:** [e2e/specs/floatingPanelSlots.spec.ts:196](../../../e2e/specs/floatingPanelSlots.spec.ts); `npx playwright test e2e/specs/floatingPanelSlots.spec.ts:196 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `a tap does the slot’s job without opening the chooser`

<a id="qa-250"></a>

## QA-250 — Раскладка между комнатами

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Изменить слоты, выйти и открыть другую комнату.

**Ожидание:** Раскладка сохранена как настройка приложения.

**Автоматизация:** [e2e/specs/floatingPanelSlots.spec.ts:210](../../../e2e/specs/floatingPanelSlots.spec.ts); `npx playwright test e2e/specs/floatingPanelSlots.spec.ts:210 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `the layout is the same in the next room`

<a id="qa-251"></a>

## QA-251 — Неизвестный инструмент в сохранённой раскладке

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Подготовить настройку с удалённым tool id и открыть панель.

**Ожидание:** Использован корректный fallback без пустого/сломавшегося UI.

**Автоматизация:** [e2e/specs/floatingPanelSlots.spec.ts:229](../../../e2e/specs/floatingPanelSlots.spec.ts); `npx playwright test e2e/specs/floatingPanelSlots.spec.ts:229 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `a layout naming a tool that no longer exists falls back to the default`

<a id="qa-252"></a>

## QA-252 — Миграция старой раскладки

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Загрузить раскладку прежнего формата с ролями кнопок.

**Ожидание:** Верхние и нижние команды сохранены в правильных слотах.

**Автоматизация:** [e2e/specs/floatingPanelSlots.spec.ts:243](../../../e2e/specs/floatingPanelSlots.spec.ts); `npx playwright test e2e/specs/floatingPanelSlots.spec.ts:243 --project=chromium`. Группа: [QA-102](interface.md#qa-102).

**Точные варианты:**

- `a layout stored with the old roles keeps its top and bottom buttons`

<a id="qa-253"></a>

## QA-253 — Рамка импортированной картинки

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Импортировать референс на слой.

**Ожидание:** Gizmo охватывает картинку и позволяет её поставить.

**Автоматизация:** [e2e/specs/imageImportGizmo.spec.ts:64](../../../e2e/specs/imageImportGizmo.spec.ts); `npx playwright test e2e/specs/imageImportGizmo.spec.ts:64 --project=chromium`. Группа: [QA-105](interface.md#qa-105).

**Точные варианты:**

- `opens the transform gizmo around the picture`

<a id="qa-254"></a>

## QA-254 — Импорт при выделении

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Сделать выделение, затем импортировать картинку.

**Ожидание:** Прежнее выделение сброшено, рамка относится к картинке.

**Автоматизация:** [e2e/specs/imageImportGizmo.spec.ts:73](../../../e2e/specs/imageImportGizmo.spec.ts); `npx playwright test e2e/specs/imageImportGizmo.spec.ts:73 --project=chromium`. Группа: [QA-105](interface.md#qa-105).

**Точные варианты:**

- `drops a standing selection, so the frame is not the selection`

<a id="qa-255"></a>

## QA-255 — Бесконечная комната

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть infinite room, нарисовать, переместить камеру и проверить overlays.

**Ожидание:** Рисунок и overlays находятся в одних мировых координатах.

**Автоматизация:** [e2e/specs/infiniteRoom.spec.ts:30](../../../e2e/specs/infiniteRoom.spec.ts); `npx playwright test e2e/specs/infiniteRoom.spec.ts:30 --project=chromium`. Группа: [QA-109](interface.md#qa-109).

**Точные варианты:**

- `opens, takes a stroke, and draws its overlays over the world`

<a id="qa-256"></a>

## QA-256 — Мышь не перехватывает перо

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Держать pen pointer и послать native mouse hover либо mouse up.

**Ожидание:** Перо продолжает свой жест без скачка и преждевременного завершения.

**Автоматизация:** [e2e/specs/inputOwnership.spec.ts:22](../../../e2e/specs/inputOwnership.spec.ts); `npx playwright test e2e/specs/inputOwnership.spec.ts:22 --project=chromium`. Группа: [QA-013](../scenarios/collaboration.md#qa-013).

**Точные варианты:**

- `native mouse hover cannot change or end a pen gesture`
- `native mouse up cannot change or end a pen gesture`

<a id="qa-257"></a>

## QA-257 — Комната без пароля

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть ссылку комнаты без password.

**Ожидание:** Поле пароля не показывается.

**Автоматизация:** [e2e/specs/joinGate.spec.ts:18](../../../e2e/specs/joinGate.spec.ts); `npx playwright test e2e/specs/joinGate.spec.ts:18 --project=chromium`. Группа: [QA-111](interface.md#qa-111).

**Точные варианты:**

- `never shows a password field for a room without one`

<a id="qa-258"></a>

## QA-258 — Пароль после отказа

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Войти без password в защищённую комнату, получить отказ, ввести правильный.

**Ожидание:** Поле появляется после отказа, успешный retry открывает комнату.

**Автоматизация:** [e2e/specs/joinGate.spec.ts:38](../../../e2e/specs/joinGate.spec.ts); `npx playwright test e2e/specs/joinGate.spec.ts:38 --project=chromium`. Группа: [QA-111](interface.md#qa-111).

**Точные варианты:**

- `asks for a password only after a passwordless attempt is refused`

<a id="qa-259"></a>

## QA-259 — Встречные переносы папок

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Двумя авторами одновременно вложить папки друг в друга, затем author Undo/Redo.

**Ожидание:** Нет цикла, итоговая структура сходится.

**Автоматизация:** [e2e/specs/layerConflicts.spec.ts:18](../../../e2e/specs/layerConflicts.spec.ts); `npx playwright test e2e/specs/layerConflicts.spec.ts:18 --project=chromium`. Группа: [QA-005](../scenarios/collaboration.md#qa-005).

**Точные варианты:**

- `opposing folder moves never create a cycle and converge after author undo/redo`

<a id="qa-260"></a>

## QA-260 — Конкурирующие свойства слоя

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Двумя авторами одновременно изменить имя/opacity/visibility, Undo/Redo и late join.

**Ожидание:** Свойства соответствуют confirmed order, все клиенты сходятся.

**Автоматизация:** [e2e/specs/layerConflicts.spec.ts:73](../../../e2e/specs/layerConflicts.spec.ts); `npx playwright test e2e/specs/layerConflicts.spec.ts:73 --project=chromium`. Группа: [QA-005](../scenarios/collaboration.md#qa-005).

**Точные варианты:**

- `concurrent layer rename follows confirmed order through undo/redo and late join`
- `concurrent layer opacity follows confirmed order through undo/redo and late join`
- `concurrent layer visibility follows confirmed order through undo/redo and late join`

<a id="qa-261"></a>

## QA-261 — Переименование выделяет имя

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть rename и начать печатать.

**Ожидание:** Полное прежнее имя заменено, а не дописан хвост.

**Автоматизация:** [e2e/specs/layerEditing.spec.ts:4](../../../e2e/specs/layerEditing.spec.ts); `npx playwright test e2e/specs/layerEditing.spec.ts:4 --project=chromium`. Группа: [QA-108](interface.md#qa-108).

**Точные варианты:**

- `rename selects the whole name and typing replaces it`

<a id="qa-262"></a>

## QA-262 — Группировка выделенных слоёв

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Выделить слои и существующее поддерево, создать folder.

**Ожидание:** Сохранён stacking order, содержимое поддерева не потеряно.

**Автоматизация:** [e2e/specs/layerEditing.spec.ts:24](../../../e2e/specs/layerEditing.spec.ts); `npx playwright test e2e/specs/layerEditing.spec.ts:24 --project=chromium`. Группа: [QA-108](interface.md#qa-108).

**Точные варианты:**

- `new folders group selections in stacking order and preserve selected subtrees`

<a id="qa-263"></a>

## QA-263 — Gaussian Blur и отмена

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Размыть нарисованный штрих, Apply, Undo.

**Ожидание:** Край смягчён, Undo возвращает исходные пиксели.

**Автоматизация:** [e2e/specs/layerFilter.spec.ts:55](../../../e2e/specs/layerFilter.spec.ts); `npx playwright test e2e/specs/layerFilter.spec.ts:55 --project=chromium`. Группа: [QA-007](../scenarios/collaboration.md#qa-007).

**Точные варианты:**

- `a Gaussian blur softens the stroke, and undo takes it back`

<a id="qa-264"></a>

## QA-264 — Cancel фильтра

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть preview, изменить параметр, Cancel.

**Ожидание:** Слой точно прежний, новой операции фильтра нет.

**Автоматизация:** [e2e/specs/layerFilter.spec.ts:76](../../../e2e/specs/layerFilter.spec.ts); `npx playwright test e2e/specs/layerFilter.spec.ts:76 --project=chromium`. Группа: [QA-007](../scenarios/collaboration.md#qa-007).

**Точные варианты:**

- `Cancel leaves the layer exactly as it was`

<a id="qa-265"></a>

## QA-265 — HSL lightness

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** К графиту применить lightness+100.

**Ожидание:** Штрих стал белым ровно после Apply.

**Автоматизация:** [e2e/specs/layerFilter.spec.ts:90](../../../e2e/specs/layerFilter.spec.ts); `npx playwright test e2e/specs/layerFilter.spec.ts:90 --project=chromium`. Группа: [QA-007](../scenarios/collaboration.md#qa-007).

**Точные варианты:**

- `lightness +100 turns graphite white once applied`

<a id="qa-266"></a>

## QA-266 — Чужой штрих во время preview

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Б рисует пока А preview фильтра; А выполняет Cancel, затем Apply и Undo/Redo.

**Ожидание:** Новые peer pixels сохранены при каждом варианте пяти фильтров.

**Автоматизация:** [e2e/specs/layerFilter.spec.ts:116](../../../e2e/specs/layerFilter.spec.ts); `npx playwright test e2e/specs/layerFilter.spec.ts:116 --project=chromium`. Группа: [QA-007](../scenarios/collaboration.md#qa-007).

**Точные варианты:**

- `gaussian_blur: remote drawing during preview survives Cancel, Apply and undo/redo`
- `motion_blur: remote drawing during preview survives Cancel, Apply and undo/redo`
- `hsl: remote drawing during preview survives Cancel, Apply and undo/redo`
- `curves: remote drawing during preview survives Cancel, Apply and undo/redo`
- `color_balance: remote drawing during preview survives Cancel, Apply and undo/redo`

<a id="qa-267"></a>

## QA-267 — Удалённая цель фильтра

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** А меняет Radius, Б удаляет слой и Undo удаления.

**Ожидание:** Dialog закрыт окончательно и не возвращается сам.

**Автоматизация:** [e2e/specs/layerFilter.spec.ts:184](../../../e2e/specs/layerFilter.spec.ts); `npx playwright test e2e/specs/layerFilter.spec.ts:184 --project=chromium`. Группа: [QA-007](../scenarios/collaboration.md#qa-007).

**Точные варианты:**

- `a deleted filter target stays dismissed when its owner undoes the deletion`

<a id="qa-268"></a>

## QA-268 — Локальный Solo

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Включить Solo через row menu, проверить peer и PNG, вернуть toolbar.

**Ожидание:** Только локальный вид скрывает другие слои, журнал/peer/export неизменны.

**Автоматизация:** [e2e/specs/layerSolo.spec.ts:116](../../../e2e/specs/layerSolo.spec.ts); `npx playwright test e2e/specs/layerSolo.spec.ts:116 --project=chromium`. Группа: [QA-108](interface.md#qa-108).

**Точные варианты:**

- `the row menu shows one layer alone, the toolbar brings the rest back, and the room never knew`

<a id="qa-269"></a>

## QA-269 — Жесты Solo

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Alt+click на eye, затем long press на том же eye.

**Ожидание:** Solo включён и прекращён предусмотренными жестами.

**Автоматизация:** [e2e/specs/layerSolo.spec.ts:172](../../../e2e/specs/layerSolo.spec.ts); `npx playwright test e2e/specs/layerSolo.spec.ts:172 --project=chromium`. Группа: [QA-108](interface.md#qa-108).

**Точные варианты:**

- `Alt+click on the eye solos, a long press on the same eye ends it`

<a id="qa-270"></a>

## QA-270 — Удаление Solo-слоя

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Включить Solo и удалить целевой слой.

**Ожидание:** Solo прекращается, экран не остаётся пустым.

**Автоматизация:** [e2e/specs/layerSolo.spec.ts:206](../../../e2e/specs/layerSolo.spec.ts); `npx playwright test e2e/specs/layerSolo.spec.ts:206 --project=chromium`. Группа: [QA-108](interface.md#qa-108).

**Точные варианты:**

- `a solo whose layer is deleted ends itself instead of blanking the screen`

<a id="qa-271"></a>

## QA-271 — Подтверждение выхода

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Нажать Leave→Stay, затем снова Leave→Leave.

**Ожидание:** Stay сохраняет редактор, подтверждение выводит домой.

**Автоматизация:** [e2e/specs/leaveGuard.spec.ts:10](../../../e2e/specs/leaveGuard.spec.ts); `npx playwright test e2e/specs/leaveGuard.spec.ts:10 --project=chromium`. Группа: [QA-114](interface.md#qa-114).

**Точные варианты:**

- `asks first — Stay keeps the room, Leave goes home`

<a id="qa-272"></a>

## QA-272 — Back внутри редактора

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Выполнить browser Back при открытой комнате.

**Ожидание:** Редактор не покидается случайно.

**Автоматизация:** [e2e/specs/leaveGuard.spec.ts:27](../../../e2e/specs/leaveGuard.spec.ts); `npx playwright test e2e/specs/leaveGuard.spec.ts:27 --project=chromium`. Группа: [QA-114](interface.md#qa-114).

**Точные варианты:**

- `Back does nothing while the editor is on screen`

<a id="qa-273"></a>

## QA-273 — Freeze комнаты

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Учитель блокирует комнату, ученик пробует рисовать, учитель снимает запрет.

**Ожидание:** Ученик не пишет при запрете и пишет после снятия.

**Автоматизация:** [e2e/specs/lessonControls.spec.ts:27](../../../e2e/specs/lessonControls.spec.ts); `npx playwright test e2e/specs/lessonControls.spec.ts:27 --project=chromium`. Группа: [QA-110](interface.md#qa-110).

**Точные варианты:**

- `freezing the room freezes the student, and unfreezing lets them go`

<a id="qa-274"></a>

## QA-274 — Freeze участника

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Учитель блокирует только одного ученика, второй продолжает.

**Ожидание:** Ограничен только выбранный участник.

**Автоматизация:** [e2e/specs/lessonControls.spec.ts:45](../../../e2e/specs/lessonControls.spec.ts); `npx playwright test e2e/specs/lessonControls.spec.ts:45 --project=chromium`. Группа: [QA-110](interface.md#qa-110).

**Точные варианты:**

- `freezing one participant freezes that participant only`

<a id="qa-275"></a>

## QA-275 — Открытие закрытого урока

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Владелец находится в закрытой комнате и нажимает reopen.

**Ожидание:** Редактирование восстановлено без выхода из комнаты.

**Автоматизация:** [e2e/specs/lessonControls.spec.ts:67](../../../e2e/specs/lessonControls.spec.ts); `npx playwright test e2e/specs/lessonControls.spec.ts:67 --project=chromium`. Группа: [QA-110](interface.md#qa-110).

**Точные варианты:**

- `the owner reopens it from inside the room`

<a id="qa-276"></a>

## QA-276 — Reopen до broadcast

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Задержать широковещательное событие, выполнить reopen.

**Ожидание:** Ответ запроса позволяет продолжить, UI не ждёт broadcast бесконечно.

**Автоматизация:** [e2e/specs/lessonControls.spec.ts:82](../../../e2e/specs/lessonControls.spec.ts); `npx playwright test e2e/specs/lessonControls.spec.ts:82 --project=chromium`. Группа: [QA-110](interface.md#qa-110).

**Точные варианты:**

- `reopening does not wait for the broadcast`

<a id="qa-277"></a>

## QA-277 — Копия ученика

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Ученик берёт работу в свою копию.

**Ожидание:** Созданная комната принадлежит ученику и открылась.

**Автоматизация:** [e2e/specs/lessonControls.spec.ts:101](../../../e2e/specs/lessonControls.spec.ts); `npx playwright test e2e/specs/lessonControls.spec.ts:101 --project=chromium`. Группа: [QA-110](interface.md#qa-110).

**Точные варианты:**

- `a student takes a copy and lands in it`

<a id="qa-278"></a>

## QA-278 — Запрет во время жеста

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Во время live gesture включить room freeze/point freeze/close lesson, затем UP.

**Ожидание:** Отказанный live ink исчез у всех; варианты запрета проверяются отдельно.

**Автоматизация:** [e2e/specs/lessonControls.spec.ts:121](../../../e2e/specs/lessonControls.spec.ts); `npx playwright test e2e/specs/lessonControls.spec.ts:121 --project=chromium`. Группа: [QA-110](interface.md#qa-110).

**Точные варианты:**

- `room freeze mid-gesture removes refused live ink on every viewer`
- `point freeze mid-gesture removes refused live ink on every viewer`
- `closed lesson mid-gesture removes refused live ink on every viewer`

<a id="qa-279"></a>

## QA-279 — Задержка пера у участника

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Двумя браузерами рисовать live stroke, снять pen-to-ink probe.

**Ожидание:** Есть измерение с соблюдением тестового localhost budget; оно не доказывает физическую межустройственную задержку.

**Автоматизация:** [e2e/specs/liveLatency.spec.ts:14](../../../e2e/specs/liveLatency.spec.ts); `npx playwright test e2e/specs/liveLatency.spec.ts:14 --project=chromium`. Группа: [QA-014](../scenarios/collaboration.md#qa-014).

**Точные варианты:**

- `a peer’s live stroke is timed pen to ink, and on localhost it is within budget`

<a id="qa-280"></a>

## QA-280 — Потерянная цель offline операции

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Отключить автора, создать shape/fill/paste, другим удалить слой, вернуть сеть.

**Ожидание:** Отказ виден, работа предложена к восстановлению без молчаливой потери.

**Автоматизация:** [e2e/specs/offlineLostWork.spec.ts:9](../../../e2e/specs/offlineLostWork.spec.ts); `npx playwright test e2e/specs/offlineLostWork.spec.ts:9 --project=chromium`. Группа: [QA-008](../scenarios/collaboration.md#qa-008).

**Точные варианты:**

- `offline shape is recovered when its layer was deleted by another participant`
- `offline area_fill is recovered when its layer was deleted by another participant`
- `offline area_paste is recovered when its layer was deleted by another participant`

<a id="qa-281"></a>

## QA-281 — Ошибка бумаги и retry

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Отказать загрузке baked paper, затем разрешить и Try again.

**Ожидание:** Комната не открыта полупустой, показана ошибка, повтор открывает холст.

**Автоматизация:** [e2e/specs/paperFailure.spec.ts:14](../../../e2e/specs/paperFailure.spec.ts); `npx playwright test e2e/specs/paperFailure.spec.ts:14 --project=chromium`. Группа: [QA-111](interface.md#qa-111).

**Точные варианты:**

- `a paper that fails to load keeps the room closed, and Try again opens it`

<a id="qa-282"></a>

## QA-282 — Paste обновляет уменьшенный вид

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Вставить и трансформировать фрагмент, отдалить камеру.

**Ожидание:** Coarse tile содержит новый результат, не только fine pixels.

**Автоматизация:** [e2e/specs/pasteMipmaps.spec.ts:8](../../../e2e/specs/pasteMipmaps.spec.ts); `npx playwright test e2e/specs/pasteMipmaps.spec.ts:8 --project=chromium`. Группа: [QA-105](interface.md#qa-105).

**Точные варианты:**

- `a transformed paste updates the zoomed-out tile as well as its base pixels`

<a id="qa-283"></a>

## QA-283 — История до прихода

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** А рисует до подключения Б; Б входит.

**Ожидание:** Б видит прежнюю работу.

**Автоматизация:** [e2e/specs/peer.spec.ts:17](../../../e2e/specs/peer.spec.ts); `npx playwright test e2e/specs/peer.spec.ts:17 --project=chromium`. Группа: [QA-001](../scenarios/collaboration.md#qa-001).

**Точные варианты:**

- `sees what was drawn before they arrived`

<a id="qa-284"></a>

## QA-284 — Новый штрих у наблюдателя

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Б уже смотрит, А рисует.

**Ожидание:** Штрих появляется у Б без reload.

**Автоматизация:** [e2e/specs/peer.spec.ts:42](../../../e2e/specs/peer.spec.ts); `npx playwright test e2e/specs/peer.spec.ts:42 --project=chromium`. Группа: [QA-001](../scenarios/collaboration.md#qa-001).

**Точные варианты:**

- `sees a stroke drawn while they are watching`

<a id="qa-285"></a>

## QA-285 — Ошибка сборки комнаты

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Вызвать исключение в финале восстановления, затем retry.

**Ожидание:** Видна ошибка вместо полуоткрытого редактора, повтор позволяет войти.

**Автоматизация:** [e2e/specs/peer.spec.ts:84](../../../e2e/specs/peer.spec.ts); `npx playwright test e2e/specs/peer.spec.ts:84 --project=chromium`. Группа: [QA-001](../scenarios/collaboration.md#qa-001).

**Точные варианты:**

- `is told when the room cannot be assembled, instead of getting a half-open editor`

<a id="qa-286"></a>

## QA-286 — Следование камере другого

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Включить follow участника и перемещать его камеру.

**Ожидание:** Наблюдатель следует выбранному автору, рисунок не меняется.

**Автоматизация:** [e2e/specs/peer.spec.ts:151](../../../e2e/specs/peer.spec.ts); `npx playwright test e2e/specs/peer.spec.ts:151 --project=chromium`. Группа: [QA-001](../scenarios/collaboration.md#qa-001).

**Точные варианты:**

- `follows the other person around the canvas`

<a id="qa-287"></a>

## QA-287 — Телефонный список и удаление

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть проекты на телефоне, новый проект и удаление карточки.

**Ожидание:** Два столбца, компактная кнопка, удаление подтверждается модалкой.

**Автоматизация:** [e2e/specs/projectCopyUi.spec.ts:33](../../../e2e/specs/projectCopyUi.spec.ts); `npx playwright test e2e/specs/projectCopyUi.spec.ts:33 --project=chromium`. Группа: [QA-112](interface.md#qa-112).

**Точные варианты:**

- `phone grid, compact new-project button and modal deletion`

<a id="qa-288"></a>

## QA-288 — Карточка создаваемой копии

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Задержать copy request.

**Ожидание:** Preparing-карточка сразу видна, прокручена в поле и disabled, затем превращена в проект.

**Автоматизация:** [e2e/specs/projectCopyUi.spec.ts:61](../../../e2e/specs/projectCopyUi.spec.ts); `npx playwright test e2e/specs/projectCopyUi.spec.ts:61 --project=chromium`. Группа: [QA-112](interface.md#qa-112).

**Точные варианты:**

- `copy immediately appears disabled, scrolls into view, then becomes a project`

<a id="qa-289"></a>

## QA-289 — Ошибка копии в списке

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Отказать copy в list view и повторить.

**Ожидание:** Preparing убрана, исходник сохранён, retry доступен.

**Автоматизация:** [e2e/specs/projectCopyUi.spec.ts:75](../../../e2e/specs/projectCopyUi.spec.ts); `npx playwright test e2e/specs/projectCopyUi.spec.ts:75 --project=chromium`. Группа: [QA-112](interface.md#qa-112).

**Точные варианты:**

- `failed copy removes its preparing card in list view and permits retry`

<a id="qa-290"></a>

## QA-290 — Копия среди поисковых результатов

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Начать copy при активном поиске.

**Ожидание:** Прогресс виден, фильтрация не прячет создаваемый проект.

**Автоматизация:** [e2e/specs/projectCopyUi.spec.ts:93](../../../e2e/specs/projectCopyUi.spec.ts); `npx playwright test e2e/specs/projectCopyUi.spec.ts:93 --project=chromium`. Группа: [QA-112](interface.md#qa-112).

**Точные варианты:**

- `copy progress remains visible in search results`

<a id="qa-291"></a>

## QA-291 — Ошибка copy-and-open

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Отказать copy-and-open.

**Ожидание:** Fullscreen loader снят, можно выполнить другое действие.

**Автоматизация:** [e2e/specs/projectCopyUi.spec.ts:104](../../../e2e/specs/projectCopyUi.spec.ts); `npx playwright test e2e/specs/projectCopyUi.spec.ts:104 --project=chromium`. Группа: [QA-112](interface.md#qa-112).

**Точные варианты:**

- `copy-and-open failure clears the full-screen loader and allows another action`

<a id="qa-292"></a>

## QA-292 — Loader до входа в копию

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Успешный copy-and-open с задержанным входом.

**Ожидание:** Loader остаётся до фактического редактора новой комнаты.

**Автоматизация:** [e2e/specs/projectCopyUi.spec.ts:116](../../../e2e/specs/projectCopyUi.spec.ts); `npx playwright test e2e/specs/projectCopyUi.spec.ts:116 --project=chromium`. Группа: [QA-112](interface.md#qa-112).

**Точные варианты:**

- `copy and open keeps the loader through the request and enters the new room`

<a id="qa-293"></a>

## QA-293 — Обрыв при входе в копию

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Потерять сеть перед join копии и вернуть.

**Ожидание:** UI сообщает отсутствие связи и продолжает вход после восстановления.

**Автоматизация:** [e2e/specs/projectCopyUi.spec.ts:142](../../../e2e/specs/projectCopyUi.spec.ts); `npx playwright test e2e/specs/projectCopyUi.spec.ts:142 --project=chromium`. Группа: [QA-112](interface.md#qa-112).

**Точные варианты:**

- `copy entry reports a missing connection and opens automatically when it returns`

<a id="qa-294"></a>

## QA-294 — Позднее продолжение вытесненной заливки

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Пять watercolor авторов, Undo, continuation во время rebuild, Redo и fresh replay.

**Ожидание:** Начало wash сохранено; SHA равны, finished-wash синхронных readback нет.

**Автоматизация:** [e2e/specs/rebuildSpill.spec.ts:28](../../../e2e/specs/rebuildSpill.spec.ts); `npx playwright test e2e/specs/rebuildSpill.spec.ts:28 --project=chromium`. Группа: [QA-019](../scenarios/collaboration.md#qa-019).

**Точные варианты:**

- `five watercolor authors survive undo, late continuation, redo and fresh replay without finished-wash spills`

<a id="qa-295"></a>

## QA-295 — Собственный offline штрих

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Отключить сеть автора, нарисовать, вернуть.

**Ожидание:** Очередь отправлена ровно один раз, peer видит штрих.

**Автоматизация:** [e2e/specs/reconnect.spec.ts:24](../../../e2e/specs/reconnect.spec.ts); `npx playwright test e2e/specs/reconnect.spec.ts:24 --project=chromium`. Группа: [QA-008](../scenarios/collaboration.md#qa-008).

**Точные варианты:**

- `work drawn offline reaches the server once the connection returns`

<a id="qa-296"></a>

## QA-296 — Работа других пока offline

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Отключить ученика, учителем рисовать, вернуть ученика.

**Ожидание:** Пропущенные операции догружены и видны.

**Автоматизация:** [e2e/specs/reconnect.spec.ts:78](../../../e2e/specs/reconnect.spec.ts); `npx playwright test e2e/specs/reconnect.spec.ts:78 --project=chromium`. Группа: [QA-008](../scenarios/collaboration.md#qa-008).

**Точные варианты:**

- `what was drawn while a student was offline reaches them when they return`

<a id="qa-297"></a>

## QA-297 — Offline удаление общего слоя

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Без сети попытаться удалить общий слой.

**Ожидание:** Отказ объяснён, опасная операция не остаётся в очереди.

**Автоматизация:** [e2e/specs/reconnect.spec.ts:123](../../../e2e/specs/reconnect.spec.ts); `npx playwright test e2e/specs/reconnect.spec.ts:123 --project=chromium`. Группа: [QA-008](../scenarios/collaboration.md#qa-008).

**Точные варианты:**

- `deleting a shared layer offline is refused, visibly, and nothing is queued`

<a id="qa-298"></a>

## QA-298 — Запоминание материала

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Выбрать материал, выйти и войти в комнату.

**Ожидание:** Тот же материал активен на устройстве.

**Автоматизация:** [e2e/specs/rememberedTool.spec.ts:39](../../../e2e/specs/rememberedTool.spec.ts); `npx playwright test e2e/specs/rememberedTool.spec.ts:39 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `a room reopens with the material it was left with`

<a id="qa-299"></a>

## QA-299 — Временный жест не запоминается

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Вызвать passing gesture и перезайти.

**Ожидание:** Сохранён постоянный материал, не временное действие.

**Автоматизация:** [e2e/specs/rememberedTool.spec.ts:54](../../../e2e/specs/rememberedTool.spec.ts); `npx playwright test e2e/specs/rememberedTool.spec.ts:54 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `a passing gesture is not what the room remembers`

<a id="qa-300"></a>

## QA-300 — Быстрый review до слоёв

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Задержать layers, открыть готовый bounded/infinite export, поставить заметки, дождаться handoff; отдельно выйти раньше.

**Ожидание:** Заметки и камера сохранены; ранний выход показывает preloader, без ложной готовности.

**Автоматизация:** [e2e/specs/reviewImage.spec.ts:17](../../../e2e/specs/reviewImage.spec.ts); `npx playwright test e2e/specs/reviewImage.spec.ts:17 --project=chromium`. Группа: [QA-113](interface.md#qa-113).

**Точные варианты:**

- `bounded review image accepts notes before layers load; handoff keeps the view and notes`
- `bounded review image accepts notes before layers load; early exit shows a preloader`
- `infinite review image accepts notes before layers load; handoff keeps the view and notes`

<a id="qa-301"></a>

## QA-301 — Upload review не удался

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Отказать upload экспортированной картинки.

**Ожидание:** Пользователю не отправлена ссылка на отсутствующий asset.

**Автоматизация:** [e2e/specs/reviewImage.spec.ts:113](../../../e2e/specs/reviewImage.spec.ts); `npx playwright test e2e/specs/reviewImage.spec.ts:113 --project=chromium`. Группа: [QA-113](interface.md#qa-113).

**Точные варианты:**

- `an export upload failure does not send a link to a missing image`

<a id="qa-302"></a>

## QA-302 — Новый user gesture для Share

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Дождаться export/upload, отдельно нажать native Share.

**Ожидание:** Native sharing получает свежий жест и работает.

**Автоматизация:** [e2e/specs/reviewImage.spec.ts:127](../../../e2e/specs/reviewImage.spec.ts); `npx playwright test e2e/specs/reviewImage.spec.ts:127 --project=chromium`. Группа: [QA-113](interface.md#qa-113).

**Точные варианты:**

- `native sharing gets a fresh user gesture after export and upload`

<a id="qa-303"></a>

## QA-303 — Legacy preview без export

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть старую preview-ссылку без готовой картинки.

**Ожидание:** Работает fallback обычной загрузки слоёв.

**Автоматизация:** [e2e/specs/reviewImage.spec.ts:148](../../../e2e/specs/reviewImage.spec.ts); `npx playwright test e2e/specs/reviewImage.spec.ts:148 --project=chromium`. Группа: [QA-113](interface.md#qa-113).

**Точные варианты:**

- `a legacy preview without an export falls back to normal layers`

<a id="qa-304"></a>

## QA-304 — Review текущей доски

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть вторую доску, Share for review.

**Ожидание:** Ссылка указывает на текущую доску и включает annotation mode.

**Автоматизация:** [e2e/specs/roomHeader.spec.ts:17](../../../e2e/specs/roomHeader.spec.ts); `npx playwright test e2e/specs/roomHeader.spec.ts:17 --project=chromium`. Группа: [QA-114](interface.md#qa-114).

**Точные варианты:**

- `Share for review sends the current board link and opens annotation mode`

<a id="qa-305"></a>

## QA-305 — Rename сохраняет урок

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Изменить имя в шапке и подтвердить.

**Ожидание:** Имя сохранено сервером, рисунок не потерян.

**Дополнительные ручные варианты из QA-432:** blank name и rename не-owner должны быть отказаны; при отказе не сбрасывается холст. Это API/ручные проверки сверх указанного E2E. Частичная поддержка: `apps/server/src/roomRoutes/roomRoutes.test.ts`, `apps/web/src/pages/Room/engineWiring.test.ts`.

**Автоматизация:** [e2e/specs/roomHeader.spec.ts:48](../../../e2e/specs/roomHeader.spec.ts); `npx playwright test e2e/specs/roomHeader.spec.ts:48 --project=chromium`. Группа: [QA-114](interface.md#qa-114).

**Точные варианты:**

- `the owner renames the lesson in place, and the server keeps it`

<a id="qa-306"></a>

## QA-306 — Отмена rename

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Начать новое имя и Esc.

**Ожидание:** Прежнее имя сохранено.

**Автоматизация:** [e2e/specs/roomHeader.spec.ts:64](../../../e2e/specs/roomHeader.spec.ts); `npx playwright test e2e/specs/roomHeader.spec.ts:64 --project=chromium`. Группа: [QA-114](interface.md#qa-114).

**Точные варианты:**

- `Esc abandons a rename and leaves the name as it was`

<a id="qa-307"></a>

## QA-307 — Rotation lock

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Включить замок и попробовать изменить угол.

**Ожидание:** Угол зафиксирован согласованно с UI.

**Автоматизация:** [e2e/specs/roomHeader.spec.ts:76](../../../e2e/specs/roomHeader.spec.ts); `npx playwright test e2e/specs/roomHeader.spec.ts:76 --project=chromium`. Группа: [QA-114](interface.md#qa-114).

**Точные варианты:**

- `the rotation lock pins the angle readout`

<a id="qa-308"></a>

## QA-308 — Возврат 100% zoom

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Изменить zoom, нажать числовое значение.

**Ожидание:** Камера возвращается к 100%.

**Автоматизация:** [e2e/specs/roomHeader.spec.ts:87](../../../e2e/specs/roomHeader.spec.ts); `npx playwright test e2e/specs/roomHeader.spec.ts:87 --project=chromium`. Группа: [QA-114](interface.md#qa-114).

**Точные варианты:**

- `clicking the zoom readout puts the zoom back to 100%`

<a id="qa-309"></a>

## QA-309 — Узкая шапка

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Сузить viewport и открыть overflow.

**Ожидание:** Все скрытые toggles доступны в меню.

**Автоматизация:** [e2e/specs/roomHeader.spec.ts:102](../../../e2e/specs/roomHeader.spec.ts); `npx playwright test e2e/specs/roomHeader.spec.ts:102 --project=chromium`. Группа: [QA-114](interface.md#qa-114).

**Точные варианты:**

- `a narrow header folds its toggles into the menu`

<a id="qa-310"></a>

## QA-310 — Повторный вход в метриках

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Дважды войти в одну комнату.

**Ожидание:** Сохранены разные завершённые входы, а не одна перезаписанная запись.

**Автоматизация:** [e2e/specs/roomOpenMetrics.spec.ts:14](../../../e2e/specs/roomOpenMetrics.spec.ts); `npx playwright test e2e/specs/roomOpenMetrics.spec.ts:14 --project=chromium`. Группа: [QA-114](interface.md#qa-114).

**Точные варианты:**

- `saves actual room finishes and distinguishes re-entry into the same room`

<a id="qa-311"></a>

## QA-311 — Медленный вход завершился

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Вызвать задержку входа до alarm, затем завершить.

**Ожидание:** Сохранены alarm и фактический finish одного входа.

**Автоматизация:** [e2e/specs/roomOpenMetrics.spec.ts:39](../../../e2e/specs/roomOpenMetrics.spec.ts); `npx playwright test e2e/specs/roomOpenMetrics.spec.ts:39 --project=chromium`. Группа: [QA-114](interface.md#qa-114).

**Точные варианты:**

- `a real slow entry saves both the alarm and its eventual finish`

<a id="qa-312"></a>

## QA-312 — Поздний finish метрики

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Повторить delivery поздних/старых измерений и неправильный input.

**Ожидание:** Нет дублей/понижения завершённого результата, input проверен.

**Автоматизация:** [e2e/specs/roomOpenMetrics.spec.ts:64](../../../e2e/specs/roomOpenMetrics.spec.ts); `npx playwright test e2e/specs/roomOpenMetrics.spec.ts:64 --project=chromium`. Группа: [QA-114](interface.md#qa-114).

**Точные варианты:**

- `updates delayed finishes without duplicates or downgrades and validates input`

<a id="qa-313"></a>

## QA-313 — Превью обычной комнаты

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть обычную комнату, отказать первой отправке, рисовать один штрих, скопировать.

**Ожидание:** Первое превью повторено, обновлено после изменений и унаследовано копией.

**Автоматизация:** [e2e/specs/roomPreviews.spec.ts:5](../../../e2e/specs/roomPreviews.spec.ts); `npx playwright test e2e/specs/roomPreviews.spec.ts:5 --project=chromium`. Группа: [QA-112](interface.md#qa-112).

**Точные варианты:**

- `ordinary room publishes its first preview, retries failure, updates after one stroke and copies it`

<a id="qa-314"></a>

## QA-314 — Новая линейка

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Потянуть из свободного места.

**Ожидание:** Линия проходит от точки DOWN до UP.

**Автоматизация:** [e2e/specs/ruler.spec.ts:36](../../../e2e/specs/ruler.spec.ts); `npx playwright test e2e/specs/ruler.spec.ts:36 --project=chromium`. Группа: [QA-106](interface.md#qa-106).

**Точные варианты:**

- `a drag off any line lays a new one from the press to the release`

<a id="qa-315"></a>

## QA-315 — Перенос линейки

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Потянуть тело существующей линии.

**Ожидание:** Линия сдвинулась целиком без изменения направления.

**Автоматизация:** [e2e/specs/ruler.spec.ts:46](../../../e2e/specs/ruler.spec.ts); `npx playwright test e2e/specs/ruler.spec.ts:46 --project=chromium`. Группа: [QA-106](interface.md#qa-106).

**Точные варианты:**

- `a drag on its body slides the whole line`

<a id="qa-316"></a>

## QA-316 — Поворот конца линейки

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Потянуть один конец линии.

**Ожидание:** Второй конец остаётся на месте.

**Автоматизация:** [e2e/specs/ruler.spec.ts:61](../../../e2e/specs/ruler.spec.ts); `npx playwright test e2e/specs/ruler.spec.ts:61 --project=chromium`. Группа: [QA-106](interface.md#qa-106).

**Точные варианты:**

- `a drag on an end swings that end and leaves the other where it was`

<a id="qa-317"></a>

## QA-317 — Delete выделения

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Выделить часть активного слоя и Delete.

**Ожидание:** Очищена только выбранная область.

**Автоматизация:** [e2e/specs/selectionActions.spec.ts:54](../../../e2e/specs/selectionActions.spec.ts); `npx playwright test e2e/specs/selectionActions.spec.ts:54 --project=chromium`. Группа: [QA-104](interface.md#qa-104).

**Точные варианты:**

- `Delete clears the selected region of the active layer`

<a id="qa-318"></a>

## QA-318 — Cut выделения

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Выделить, Cut, затем Paste.

**Ожидание:** Фрагмент есть в clipboard, исходная область очищена.

**Автоматизация:** [e2e/specs/selectionActions.spec.ts:76](../../../e2e/specs/selectionActions.spec.ts); `npx playwright test e2e/specs/selectionActions.spec.ts:76 --project=chromium`. Группа: [QA-104](interface.md#qa-104).

**Точные варианты:**

- `Cut fills the clipboard and then clears the region`

<a id="qa-319"></a>

## QA-319 — Delete на locked слое

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Заблокировать слой, выделить и Delete.

**Ожидание:** Пиксели не изменены, операция не принята.

**Автоматизация:** [e2e/specs/selectionActions.spec.ts:90](../../../e2e/specs/selectionActions.spec.ts); `npx playwright test e2e/specs/selectionActions.spec.ts:90 --project=chromium`. Группа: [QA-104](interface.md#qa-104).

**Точные варианты:**

- `a locked layer refuses Delete`

<a id="qa-320"></a>

## QA-320 — Многоугольное лассо

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Поставить вершины последовательными кликами, закончить double-click.

**Ожидание:** Создана правильная замкнутая область без лишней вершины.

**Автоматизация:** [e2e/specs/selectionActions.spec.ts:114](../../../e2e/specs/selectionActions.spec.ts); `npx playwright test e2e/specs/selectionActions.spec.ts:114 --project=chromium`. Группа: [QA-104](interface.md#qa-104).

**Точные варианты:**

- `the point-by-point lasso places vertices and closes on a double-click`

<a id="qa-321"></a>

## QA-321 — Кнопки выделения

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Без выделения и с ним нажать Copy/Delete/Deselect в quick column.

**Ожидание:** Кнопки доступны только при подходящем состоянии и делают свою операцию.

**Автоматизация:** [e2e/specs/selectionActions.spec.ts:138](../../../e2e/specs/selectionActions.spec.ts); `npx playwright test e2e/specs/selectionActions.spec.ts:138 --project=chromium`. Группа: [QA-104](interface.md#qa-104).

**Точные варианты:**

- `the quick column’s buttons copy, delete and deselect, and wait for something to act on`

<a id="qa-322"></a>

## QA-322 — Finger tap снимает выделение

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Сделать выделение и тапнуть пальцем снаружи.

**Ожидание:** Выделение снято.

**Автоматизация:** [e2e/specs/selectionTap.spec.ts:80](../../../e2e/specs/selectionTap.spec.ts); `npx playwright test e2e/specs/selectionTap.spec.ts:80 --project=chromium`. Группа: [QA-104](interface.md#qa-104).

**Точные варианты:**

- `a tap clears the selection`

<a id="qa-323"></a>

## QA-323 — Тап внутри выделения

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Тапнуть пальцем внутри выделения.

**Ожидание:** Выделение снято так же, как при pen tap.

**Автоматизация:** [e2e/specs/selectionTap.spec.ts:92](../../../e2e/specs/selectionTap.spec.ts); `npx playwright test e2e/specs/selectionTap.spec.ts:92 --project=chromium`. Группа: [QA-104](interface.md#qa-104).

**Точные варианты:**

- `a tap inside the selection clears it too, exactly as the pen does`

<a id="qa-324"></a>

## QA-324 — Pan сохраняет выделение

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Вместо тапа выполнить однопальцевый pan.

**Ожидание:** Камера движется, выделение не снимается.

**Автоматизация:** [e2e/specs/selectionTap.spec.ts:107](../../../e2e/specs/selectionTap.spec.ts); `npx playwright test e2e/specs/selectionTap.spec.ts:107 --project=chromium`. Группа: [QA-104](interface.md#qa-104).

**Точные варианты:**

- `a one-finger pan leaves the selection alone`

<a id="qa-325"></a>

## QA-325 — Редактируемый прямоугольник

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Создать rectangle, изменить до commit, подтвердить.

**Ожидание:** До commit есть редактируемая рамка, после есть pixels и одна операция.

**Автоматизация:** [e2e/specs/shapes.spec.ts:58](../../../e2e/specs/shapes.spec.ts); `npx playwright test e2e/specs/shapes.spec.ts:58 --project=chromium`. Группа: [QA-103](interface.md#qa-103).

**Точные варианты:**

- `a rectangle stays editable, then lands on the canvas and in the log`

<a id="qa-326"></a>

## QA-326 — Клик фигурой без drag

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Нажать и отпустить в одной точке.

**Ожидание:** Ни фигуры, ни операции нет.

**Автоматизация:** [e2e/specs/shapes.spec.ts:85](../../../e2e/specs/shapes.spec.ts); `npx playwright test e2e/specs/shapes.spec.ts:85 --project=chromium`. Группа: [QA-103](interface.md#qa-103).

**Точные варианты:**

- `a click that never moved records nothing`

<a id="qa-327"></a>

## QA-327 — Esc незаконченной фигуры

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Начать фигуру и нажать Esc.

**Ожидание:** Нет следа и durable operation.

**Автоматизация:** [e2e/specs/shapes.spec.ts:100](../../../e2e/specs/shapes.spec.ts); `npx playwright test e2e/specs/shapes.spec.ts:100 --project=chromium`. Группа: [QA-103](interface.md#qa-103).

**Точные варианты:**

- `Esc drops an unconfirmed shape without a trace`

<a id="qa-328"></a>

## QA-328 — Handles после UP

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Создать фигуру до UP, затем подвигать handles.

**Ожидание:** Фигура остаётся редактируемой до подтверждения.

**Автоматизация:** [e2e/specs/shapes.spec.ts:117](../../../e2e/specs/shapes.spec.ts); `npx playwright test e2e/specs/shapes.spec.ts:117 --project=chromium`. Группа: [QA-103](interface.md#qa-103).

**Точные варианты:**

- `the handles keep working after the pen comes up`

<a id="qa-329"></a>

## QA-329 — Shift квадрат

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Тянуть rectangle с Shift.

**Ожидание:** Стороны равны в мировых координатах.

**Автоматизация:** [e2e/specs/shapes.spec.ts:144](../../../e2e/specs/shapes.spec.ts); `npx playwright test e2e/specs/shapes.spec.ts:144 --project=chromium`. Группа: [QA-103](interface.md#qa-103).

**Точные варианты:**

- `Shift constrains the drag to a square`

<a id="qa-330"></a>

## QA-330 — Рисование каждым типом фигуры

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** По очереди создать все зарегистрированные shape tools.

**Ожидание:** Каждый тип даёт видимые pixels и допустимую операцию.

**Автоматизация:** [e2e/specs/shapes.spec.ts:159](../../../e2e/specs/shapes.spec.ts); `npx playwright test e2e/specs/shapes.spec.ts:159 --project=chromium`. Группа: [QA-103](interface.md#qa-103).

**Точные варианты:**

- `every shape tool paints something`

<a id="qa-331"></a>

## QA-331 — Растушёвка на шве

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Растушевать графит вниз поперёк x=1024.

**Ожидание:** Нет мёртвой полосы шириной с кисть.

**Автоматизация:** [e2e/specs/smudgeSeam.spec.ts:35](../../../e2e/specs/smudgeSeam.spec.ts); `npx playwright test e2e/specs/smudgeSeam.spec.ts:35 --project=chromium`. Группа: [QA-106](interface.md#qa-106).

**Точные варианты:**

- `no dead band at x=TILE_SIZE: the stump drags graphite down at every x`

<a id="qa-332"></a>

## QA-332 — Вход из snapshot

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Довести историю до снимка, войти новым участником.

**Ожидание:** Восстановлены stored pixels и только нужный tail, не полный тяжёлый replay.

**Автоматизация:** [e2e/specs/snapshot.spec.ts:69](../../../e2e/specs/snapshot.spec.ts); `npx playwright test e2e/specs/snapshot.spec.ts:69 --project=chromium`. Группа: [QA-036](watercolor.md#qa-036).

**Точные варианты:**

- `the joiner restores from stored pixels instead of replaying everything`

<a id="qa-333"></a>

## QA-333 — Недоступный snapshot blob

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Отказать blob-запросам, затем retry.

**Ожидание:** Ошибка видна вместо пустого рисунка, повтор восстановил работу.

**Автоматизация:** [e2e/specs/snapshot.spec.ts:105](../../../e2e/specs/snapshot.spec.ts); `npx playwright test e2e/specs/snapshot.spec.ts:105 --project=chromium`. Группа: [QA-036](watercolor.md#qa-036).

**Точные варианты:**

- `a joiner whose snapshot never arrives is told, not shown an empty room`

<a id="qa-334"></a>

## QA-334 — HTTP доступ без socket

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Успешно войти, отключить socket и запросить snapshot; сменить пароль.

**Ожидание:** Успешный участник продолжает читать, смена пароля отзывает старое разрешение.

**Автоматизация:** [e2e/specs/snapshotAccess.spec.ts:5](../../../e2e/specs/snapshotAccess.spec.ts); `npx playwright test e2e/specs/snapshotAccess.spec.ts:5 --project=chromium`. Группа: [QA-111](interface.md#qa-111).

**Точные варианты:**

- `snapshot HTTP access survives socket disconnect and is revoked by a password change`

<a id="qa-335"></a>

## QA-335 — Одна кнопка материалов

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть рейку при нескольких доступных материалах.

**Ожидание:** Группа представляет все материалы и показывает активный.

**Автоматизация:** [e2e/specs/toolGroup.spec.ts:35](../../../e2e/specs/toolGroup.spec.ts); `npx playwright test e2e/specs/toolGroup.spec.ts:35 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `one button stands for every material, and says which one is in hand`

<a id="qa-336"></a>

## QA-336 — Два тапа группы

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Первым тапом взять группу, вторым открыть chooser.

**Ожидание:** Первый тап не открывает лишний popup, второй открывает.

**Автоматизация:** [e2e/specs/toolGroup.spec.ts:52](../../../e2e/specs/toolGroup.spec.ts); `npx playwright test e2e/specs/toolGroup.spec.ts:52 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `a second tap opens the chooser; the first one only selects`

<a id="qa-337"></a>

## QA-337 — Выбор материала группы

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Через chooser выбрать другой материал.

**Ожидание:** Новый материал взят, кнопка его отражает.

**Автоматизация:** [e2e/specs/toolGroup.spec.ts:70](../../../e2e/specs/toolGroup.spec.ts); `npx playwright test e2e/specs/toolGroup.spec.ts:70 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `choosing a material takes it, and the button then wears it`

<a id="qa-338"></a>

## QA-338 — Hold группы без смены

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Удержать group button при другом активном инструменте.

**Ожидание:** Chooser открыт, материал не сменился до выбора.

**Автоматизация:** [e2e/specs/toolGroup.spec.ts:88](../../../e2e/specs/toolGroup.spec.ts); `npx playwright test e2e/specs/toolGroup.spec.ts:88 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `a hold opens the chooser without changing the tool under it`

<a id="qa-339"></a>

## QA-339 — Группа фигур

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть shape group и выбрать вариант.

**Ожидание:** Группа меняет нужную shape setting согласованно с инструментом.

**Автоматизация:** [e2e/specs/toolGroup.spec.ts:109](../../../e2e/specs/toolGroup.spec.ts); `npx playwright test e2e/specs/toolGroup.spec.ts:109 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `the shape button is the same group, over a setting instead of a tool`

<a id="qa-340"></a>

## QA-340 — Единственный материал

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Создать комнату, где доступен один материал, нажать группу.

**Ожидание:** Бесполезного chooser нет.

**Автоматизация:** [e2e/specs/toolGroup.spec.ts:133](../../../e2e/specs/toolGroup.spec.ts); `npx playwright test e2e/specs/toolGroup.spec.ts:133 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `a room offering one material has nothing to choose, so it offers no chooser`

<a id="qa-341"></a>

## QA-341 — Вкладка настроек следует инструменту

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть tool settings и менять инструмент.

**Ожидание:** Показаны настройки текущего инструмента.

**Автоматизация:** [e2e/specs/toolSettingsTab.spec.ts:8](../../../e2e/specs/toolSettingsTab.spec.ts); `npx playwright test e2e/specs/toolSettingsTab.spec.ts:8 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `the Tool settings tab shows the tool in hand, and follows it`

<a id="qa-342"></a>

## QA-342 — Размер store доходит до движка

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Изменить размер через store/UI и нарисовать второй штрих.

**Ожидание:** Крупный размер реально даёт более высокий след.

**Автоматизация:** [e2e/specs/toolSync.spec.ts:28](../../../e2e/specs/toolSync.spec.ts); `npx playwright test e2e/specs/toolSync.spec.ts:28 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `a size set in the store reaches the engine — a bigger brush lays a taller mark`

<a id="qa-343"></a>

## QA-343 — Смена инструмента доходит до движка

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Изменить tool в store на eraser и рисовать.

**Ожидание:** Следующий жест стирает, а не продолжает прежний материал.

**Автоматизация:** [e2e/specs/toolSync.spec.ts:57](../../../e2e/specs/toolSync.spec.ts); `npx playwright test e2e/specs/toolSync.spec.ts:57 --project=chromium`. Группа: [QA-101](interface.md#qa-101).

**Точные варианты:**

- `a tool set in the store reaches the engine — the next stroke is the eraser’s`

<a id="qa-344"></a>

## QA-344 — Transform после UP

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Перетащить слой и отпустить.

**Ожидание:** Pixels остаются в новом месте, transform записан.

**Автоматизация:** [e2e/specs/transformCommit.spec.ts:44](../../../e2e/specs/transformCommit.spec.ts); `npx playwright test e2e/specs/transformCommit.spec.ts:44 --project=chromium`. Группа: [QA-105](interface.md#qa-105).

**Точные варианты:**

- `a dragged layer stays where it was dropped, and the move is in the log`

<a id="qa-345"></a>

## QA-345 — Undo незавершённого move

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Начать transform, до commit нажать Undo.

**Ожидание:** Move отброшен, исходный штрих сохранён.

**Автоматизация:** [e2e/specs/transformCommit.spec.ts:76](../../../e2e/specs/transformCommit.spec.ts); `npx playwright test e2e/specs/transformCommit.spec.ts:76 --project=chromium`. Группа: [QA-105](interface.md#qa-105).

**Точные варианты:**

- `undo while a move is open throws the move away and keeps the stroke`

<a id="qa-346"></a>

## QA-346 — Resample на границе тайлов

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Повернуть/масштабировать рисунок через границу исходных тайлов.

**Ожидание:** В запечённой картинке нет линии шва.

**Автоматизация:** [e2e/specs/transformSeam.spec.ts:32](../../../e2e/specs/transformSeam.spec.ts); `npx playwright test e2e/specs/transformSeam.spec.ts:32 --project=chromium`. Группа: [QA-105](interface.md#qa-105).

**Точные варианты:**

- `no source-tile boundary shows through a resampling transform`

<a id="qa-347"></a>

## QA-347 — Поздний seq своего штриха

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Задержать доставку штриха А, дать Б завершить раньше, затем подтвердить А.

**Ожидание:** Автор перекрасил свой результат в server order, равный peer и fresh joiner.

**Автоматизация:** [e2e/specs/trueOrder.spec.ts:82](../../../e2e/specs/trueOrder.spec.ts); `npx playwright test e2e/specs/trueOrder.spec.ts:82 --project=chromium`. Группа: [QA-002](../scenarios/collaboration.md#qa-002).

**Точные варианты:**

- `the author of a delayed stroke re-settles into the server order`

<a id="qa-348"></a>

## QA-348 — Рука в телефонных аннотациях

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Войти с телефона/preview, затем явно выбрать annotation tool и обновить состояние.

**Ожидание:** Начальный hand не затирает сознательный выбор при последующих обновлениях.

**Автоматизация:** [e2e/specs/uiAnnotationDefaults.spec.ts:27](../../../e2e/specs/uiAnnotationDefaults.spec.ts); `npx playwright test e2e/specs/uiAnnotationDefaults.spec.ts:27 --project=chromium`. Группа: [QA-113](interface.md#qa-113).

**Точные варианты:**

- `phone and preview start with hand, deliberate annotation choices survive updates`

<a id="qa-349"></a>

## QA-349 — Minimal UI по умолчанию

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть чистые настройки, затем сохранить false и открыть снова.

**Ожидание:** Default включён, сохранённое false не сбрасывается.

**Автоматизация:** [e2e/specs/uiAnnotationDefaults.spec.ts:64](../../../e2e/specs/uiAnnotationDefaults.spec.ts); `npx playwright test e2e/specs/uiAnnotationDefaults.spec.ts:64 --project=chromium`. Группа: [QA-113](interface.md#qa-113).

**Точные варианты:**

- `minimal UI defaults on and saved false survives reopening settings`

<a id="qa-350"></a>

## QA-350 — Базовый Undo/Redo

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Нарисовать, Undo, Redo.

**Ожидание:** Штрих исчезает и возвращается один раз.

**Автоматизация:** [e2e/specs/undo.spec.ts:18](../../../e2e/specs/undo.spec.ts); `npx playwright test e2e/specs/undo.spec.ts:18 --project=chromium`. Группа: [QA-006](../scenarios/collaboration.md#qa-006).

**Точные варианты:**

- `undo takes the stroke off the canvas, redo puts it back`

<a id="qa-351"></a>

## QA-351 — Версия в Settings

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Открыть настройки версии.

**Ожидание:** Строка точно соответствует stamped build version.

**Автоматизация:** [e2e/specs/version.spec.ts:20](../../../e2e/specs/version.spec.ts); `npx playwright test e2e/specs/version.spec.ts:20 --project=chromium`. Группа: [QA-114](interface.md#qa-114).

**Точные варианты:**

- `settings shows exactly the version this build was stamped with`

<a id="qa-352"></a>

## QA-352 — Версия в globalThis

**Начало и участники:** Подготовленный E2E-стенд, новая disposable комната и fixture указанного теста; независимые identity для peer-случаев. Для HTTP-only проверки достаточно тестового API. Физический ввод и GPU отдельно от browser automation.

**Действия:** Прочитать exposed app version из страницы.

**Ожидание:** Значение равно stamped build и видимой версии.

**Автоматизация:** [e2e/specs/version.spec.ts:25](../../../e2e/specs/version.spec.ts); `npx playwright test e2e/specs/version.spec.ts:25 --project=chromium`. Группа: [QA-114](interface.md#qa-114).

**Точные варианты:**

- `and the same string is on globalThis, for a console that has no UI`
