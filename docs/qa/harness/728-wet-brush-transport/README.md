# DEV прототип нового оператора кисти

Это **новая модель**, не порт canonical watercolor и не готовая WebGPU акварель
Grafetto. Production/defaults/shared/Room не меняются. OFF — reference deposition
без transport; checkbox изначально выключен. Hardware/картинка ещё не проверены.

## Математический принцип

Два tracer mass поля — bounded uint32, каждая клетка/канал0…65535. Водяной gate
для пары `min(Wa,Wb,contactA,contactB)`. Соседняя checkerboard пара сначала
обменивается частью разницы концентраций (mix), затем переносит часть массы
в направлении движения кисти (advection). Каждое перенесённое целое число
вычитается из source и прибавляется к target; сумма **каждого tracer** сохраняется
exactly. Capacity limiter ограничивает target без уничтожения остатка. Один
compute dispatch обрабатывает непересекающиеся пары; между passes ping-pong.
Нет float filtering, atomics или плавающих GPU threshold. Uint multiplication
не переполняется:65535²<2³². Четыре passes чередуют axis/parity.

Own water и ранее нанесённая вода используют **одну** depositWetBrush функцию.
Даб задаёт max water и additive capped tracer dose. Тест matched geometry без
transport подтверждает одинаковые water/contact/mass для combined vswater+pigment.
Время появления воды может отличаться: заранее мокрое соседство реально больше,
поэтому для scene comparison не обещаем identical final image.

Стенд: плотный400 zigzag (128cells/1024world, radius25cells) и тот же штрих по
заранее нанесённой воде. Два цвета/трассера позволяют увидеть перенос ранее
лежащего пигмента. ReferenceOFF справа/слева; candidateON обязан пройти CPU/GPU
exact bytes и mass gates. Mixingindex=1−Σ|P1−P2|/Σ(P1+P2), checkerboardcontrast —
разница средних масс по parity/общая средняя. Это диагностика, не оценка качества.
Стационарный chessboard fixture проверяет подавление grid parity; движущийся
случай всё равно надо смотреть на real GPU. Integer floor даёт мелкое numerical
pinning и порядок axis может создавать anisotropy — это открытые ограничения.

## Проверки/запуск

CPU4tests: точная масса100cycles, drygap, direction reverse, единое нанесение и
затухание искусственной checkerboard структуры. Full apps/web typecheck и
отдельный strict run.ts typecheck проходят. GPU WGSL ещё не компилировался на
устройстве; CPU pass не объявляется GPU pass.

`QA_OUT=temp/wet-brush-transport-prototype node docs/qa/harness/728-wet-brush-transport/build.mjs`

13KB bundle без paper assetcopies. Постоянный сервис/публикация не созданы.
Каждый step ждёт queuecompletion для жизни маленького fixture; это не замер
performance. Изображение простой tracer presentation: нет productionpaper,
tide/drying/rim или realistic rendering claim.

## Следующая обратимая интеграция обычной Room

Принцип границы: **CPU delivery once, экспериментальный GPU owner отдельно**.
Использовать существующий `PreparedRibbonCpuDelivery` после production
prepareDelivery. Из immutable brushTravel/commands вывести quantized contact
recipe один раз per retained dab (не per tile); same map of water/pigment source
передавать новому transport owner. Подмешивать новую физику только при DEV flag
до canonical settle source capture. OFF обязан оставлять существующие commands,
fields и final bytes без изменений. Нельзя незаметно сделать финальную картинку
недетерминированной: recipe/seed/order привязать к recorded stroke/dabs; до общей
комнаты проверять author/replay exact и2GPU. Shared operation contract пока не
меняем: opt-in backend эксперимента имеет отдельный паспорт/версию и не выдаётся
за production replay старой модели.

Блокер реальной интеграции: canonical P содержит Rwater/Gwet/Bpigment/Aamount,
а C — optical premultiplied color, не два независимых физические tracer. Нельзя
просто перелить experimental P1/P2 в P/C и сохранить смысл/массу. Нужно решение
о mass carrier: минимальный reversible кандидат — transport **существующих**
P.B и C premultiplied moments совместно с дозовым отношением, отдельный точный
budget/pass. Boundaries/foreign-wash/undo/layer owner пока обязательные explicit
unsupported. Этот prototype отвечает на вопрос поведения оператора, не закрывает
integration seam. Следующий review должен определить carrier и replay contract,
затем same original tape source/whole/dry+undo gates в обычной Room.
