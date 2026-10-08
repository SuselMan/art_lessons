# Native ordinary Room: Surface init gate — 8 октября 2026

Frozen `2c1d44b9`, actual Room на Surface Chrome154, secure origin и navigator.gpu
доступны. Все 1134 source SHA, семь baked paper SHA и HTTP SHA engine/index и
roomNativeRuntime проверены. Ни один native штрих в этих попытках не отправлен.

Первые две попытки остановились на JoinGate после reload `wcNative=1`. После
добавления UI Join-loop кнопка стала disabled «Подключение…», но `window.__engine`
не появился за45 секунд. Исключений страницы не записано. Это не доказательство
ошибки GPU; initial обычный GL engine был жив, GL0.

Последний разрешённый повтор был только INIT, watchdog120 секунд, без рисования,
readback и дополнительных GPU fences. До Join были установлены обёртки start/end/
reject вокруг static RoomNativeRuntime.create, CanonicalWatercolorWebGpu.create и
support, а также preload getPaperBytes. Маркеры хранились в собственной странице.
При preflight1751 MiB во время native-init свободная RAM упала до364 MiB;
обязательный abort500 закрыл только собственный target. После закрытия RAM
восстановилась до1954 MiB. Pending CDP завершился timeout Runtime.evaluate.
Маркеры до закрытия не были выгружены, поэтому конкретный зависший await,
виновный ресурс и связь с shader compilation **не установлены**.

Native40 quality/visibility gate на Surface остаётся **открытым**. Эти результаты
не подтверждают parity, нормальную память или отзывчивость native ordinary Room,
и не заменяют уже пройденный WebGL Room400 gate. Samsung не использовался.
Чужие вкладки и Chrome не перезапускались; после cleanup устройство освобождено.

Приватные raw сохранены в `temp/room-gl-factorial/native-surface40`,
`native-surface40-joined`, `native-surface-init-traced`. Следующее диагностическое
исправление контроллера: выгружать init markers заранее и при достижении порога
памяти, без нового GPU запуска и без увеличения лимита/ослабления guard.
