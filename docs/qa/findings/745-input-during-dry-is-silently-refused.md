# Новый ввод сразу после подтверждения сушки молча теряется

Кампания #745, runtime0c83ca99, Vega realGPU. В background-peer-dry fixture
после подтверждения paper_dry сервером пользователь B делает новый реальный
_onStart→moves→_onEnd. _onStart не создаёт _strokeId: Foreground peer stroke refused.
Исходный FAIL сохранён: temp/device-runs/745-final2-background-dry/report.json,
failure PNG. Автор A в этот момент в CDP lifecycle frozen (не OS sleep).

Это не доказательство deadlock; B ещё завершал визуальную drying фазу.
Но новый ввод был проигнорирован без обратной связи. Очередь/подтверждение dry
не гарантируют, что кисть уже принимает ввод. После dry операция должна снова
добавлять мокрый материал, поэтому отказ требует продуктового решения.

Статически _onStart блокирует любую кисть при this._puddle?.state.drying,
до определения layerId: блок глобальный, другой активный слой также затронут.
Фактическая длительность blocked input исходной попыткой не измерена.
Retry harness ожидает только собственный drying=false перед новым жестом,
отдельно замеряет время ожидания после ACK; такой PASS не отменяет исходную находку.

Исправление #755 подтверждено runtime1e521993 на Vega: непосредственно перед
DOWN drying=true/queue0, ожидания окончания drying НЕТ, inputAccepted=true.
Peer A был CDP lifecycle frozen; после active очередь завершилась, dry boundary
обоим одинаков, actual сухие targets совпали с full replay обоим (changed0).
Report: temp/device-runs/745-final5-background-immediate/report.json.
Обычная скрытая вкладка/OS sleep этим не подтверждаются: actualvisibility была
visible и RAF продолжался, поэтому использован явно обозначенный frozen fallback.
Старый failedfixture удалён owner API, auth удалён; evidence сохранено.
