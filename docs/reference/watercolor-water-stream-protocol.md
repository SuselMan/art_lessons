# #680: протокол воды и пигмента по ходу жеста

Изолированная база be1dc506. Это исполнимый диагностический контракт, НЕ готовое изменение движка и не проверка улучшенной акварели. Rejected viscosity swap91705c37 не входит в эту ветку.

На каждом сегменте нужны независимые payload: геометрия/количество доставленной воды и геометрия/доза пигмента. Порядок: сохранить contact-before для pickup → рассчитать расход кисти → внести water → прочитать available-after → внести pigment → дать общей жидкости переместить уже лежащий и новый пигмент. Следующий сегмент повторяет этот цикл. Нельзя сначала рисовать всю водную траекторию, затем всю пигментную.

`watercolor-water-stream-protocol.ts` — небольшой исполнимый контракт с prescribed одинаковыми payload. Combined input и explicit water/pigment events выполняются water→pigment для каждого из12 сегментов; все промежуточные fluid/pigment состояния совпадают. Pure water не изменяет pigment record. Общая внесённая и сохранённая pigment dose0.9251241333262082. Расход brush reservoir не получает newly-delivered water обратно. Это контроль порядка и количества входа, а не визуальный причинный A/B production.

## Доказанные ограничения старого пути

1. Два обычных stroke-op не дают matched water input. На сухой бумаге через20 радиусов actual WaterLoad цветной кисти0.3931642635; у bottomless clear-water кисти1. Различие возникает до транспорта. Независимый water payload должен рассчитываться ОДИН раз от общего brush reservoir и применяться одинаково в combined и explicit представлении.
2. PaperWetness хранит MAX wetness state, не объём. MAX(1,1)=1 — два внесения воды невозможно отличить от одного по этому полю. Сравнение одинаковой coverage не доказывает равный объём жидкости. В первом прототипе можно явно оставить MAX-domain, но нельзя называть его mass-conserving water volume.
3. Живой wetProfile записывается до paint; pending текущего жеста не виден sample. Он подходит для before-contact pickup, но не для after-water transport. Делать pending видимым тому же pickup опасно: кисть немедленно пьёт только что внесённую воду.
4. RibbonStrokePainter рассчитывает все dose maps batch заранее, потом рисует все coverage stamps/bands, потом все pigment stamps/bands. Per-segment порядок нельзя получить простой добавкой отдельного water stroke: требуется выделить segment execution primitive, сохранив state часов/surplus между порциями и одинаковую film MAX семантику.
5. inkLoad.a сейчас carrier, а не pigment. Чистая вода создаёт .a/r без .b/depth. Просто удалить этот вклад или поменять viscosity на.b меняет подвижность и RGBA8-потери: отдельная91705c37 абляция дала мутную кляксу и −4.36% pigment codes. Поэтому независимый pigment record требует явного решения, что тормозит локальный обмен; нельзя скрыть это под невинным «два прохода».

## Минимальная интеграция после контракта

Вынести расчёт `SegmentDelivery {waterPayload, pigmentPayload, contactBefore}` из painter maps. В одной segment execution primitive провести coverage stamp+band этого сегмента, затем pigment stamp+band с available-after. Ink record писать только для pigment; цветовой depth — тот же pigment payload. Before-contact остаётся отдельным значением для finite pickup. Поля MAX standing/domain можно пока сохранить, явно назвав это approximated film, а не объёмом. WaterClock и dose рассчитываются один раз, одинаково для обеих формы input. Для film нужны отдельные immutable base + current-stroke envelopes; segment splitting не должен переписать MAX в ADD.

Перед визуальным кандидатом нужен GPU matched-input harness на этой primitive: prescribed water/pigment payload, identical source doses, combined vs interleaved explicit events, снимки standing/pigment/depth после каждого сегмента и stage transport; затем live/load/rebuild. Контракт в этом документе не заменяет эту проверку. Блокирует быструю реализацию именно отсутствие независимых payload и сегментного исполнения в нынешнем painter, а не GPU, доступ или согласование пользователя.

Документ и oracle позволяют review минимальной границы вмешательства; новых production полей, ветвления op-log и fluid solver здесь нет. GPU свободен; Samsung и5290 не использованы.
