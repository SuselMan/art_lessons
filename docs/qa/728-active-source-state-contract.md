# Активный материал, base и film: проверяемый контракт

Аудит 09.10.2026, без изменения физики. Источники:
`webgpuCanonical/tileScratch.ts:47`, `sourcePhaseExecutor.ts:55–97`,
`passes/fieldOps.ts:32,157`; подготовленный readonly observer —
`harness/728-room-moment/stage-probe.mjs`.

| Роль | Значение и ограничение |
|---|---|
| inkLoad / inkColor | Текущие нормализованные P/C записи после source landing |
| inkBase / colorBase | Снимок load при смене materialGesture; не доказанная «неподвижная масса» |
| strokeInk / strokeColor | Накопленный source film текущей gesture; MAX не равен сумме доз |
| inkSettled / colorSettled | Отдельные снимки осадка; отсутствие необходимо сохранять явно |

`filmBuffers` один раз при смене materialGesture копирует load в base и очищает
film. Между source сегментами base сохраняется; source landing независимо для
P/C применяет mode1 к base и текущему film. Для k=f=1 идеальная CPU запись:
`fit(v)=round(255*v/max(255,max(v)))`.

Проверяемые инварианты:

- Readonly публикация native результата в GL не меняет ни одну из восьми ролей,
  включая отсутствие ресурса. Это доказывает observer lifecycle, а не физику.
- При неизменном base и кумулятивном MAX film итог не зависит от разбиения одного
  и того же набора контактов на порции. Очищение film и rebase между контактами
  меняют уравнение источника, даже без переноса пигмента.
- Каждая fitted запись конечна и ограничена u8. Между независимыми P/C fit нельзя
  требовать C<=P.B. Условное RGB<=C.A сохраняется MAX/add/fit, если выполнялось
  у всех входов; его нельзя навязывать произвольным реальным optical моментам.
- Консервативный перенос уже записанных каналов сохраняет их Q8 суммы, но это
  не доказывает сохранение исходной физической дозы до fit. MAX и fit неинъективны.
- Нельзя подменять historical settled snapshot техническим continuation base:
  `max(load-snapshot,0)` после такого rebase может обнулить mobile budget.

Минимальный CPU пример: base=[200,0,0,200], два source film
[100,0,0,100] и [0,200,0,200]. Неизменный base плюс MAX film даёт
[191,128,0,255]; последовательное rebase/очистка film даёт [143,112,0,255].
Это различие формулы, а не ошибка округления. Отдельный неинъективный пример:
fit([255,0,0,255])=fit([510,0,0,510]), хотя исходные totals отличаются вдвое.

`wetSourceStateContract.test.ts` содержит эти примеры и 500 условных RGB/A
fixtures. Это идеальная CPU-Q8 алгебра, не обещание точного аппаратного округления.
Предыдущий `wetBrushMomentCarrierCounterexample.test.ts` отдельно фиксирует
потерю mobile после refresh исторического snapshot и signed/clamped различие.

Подготовленный A wetmix gate наблюдает три контакта (вода, фиолетовый, жёлтый),
по 96² восьми ролям до/после успешной публикации. Никаких новых snapshot записей
или обхода capacity/foreign guards. Этот аппаратный cohort ещё не выполнен.

Приватная actual Room review-страница проверена по HTTP SHA и двум ссылкам:
файл адреса `~/.local/share/project-services/watercolor-qa/tip-room-review-d758.url`.
Одна 25-дабовая лента; A меняет контакт, поэтому exact literal/A изображение не
ожидается. Подтверждены source/visibility/UndoRedo и UI400 одного сценария;
wetmix, несколько участников, физическая latency и художественная оценка всех
мазков остаются открытыми. Samsung этим агентом не используется.
