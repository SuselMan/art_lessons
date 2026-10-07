# #728: новое касание водой → пигментом без синхронного drain

Изолированный frozen87f runtime, Surface Pro8/Intel Iris Xe/Chrome154,
Fine1754×2480, собственные обычные комнаты на VPS QA. Joined/deferred ON в обеих
arms; меняется только private mixed-admission flag, product defaults неизменны.
Кисть400, фиксированные два жеста water100/pigment0 → water100/pigment100 PB29.

| Проверка | Mixed OFF | Mixed ON |
|---|---:|---:|
| CPU обработчик второго DOWN | 12.3ms | 4.2ms |
| Ожидание контрольного GPU read после DOWN | 671.7ms | 49.2ms |
| Верхняя граница готовности первых pigment pixels | 714.6ms | 63.1ms |
| Принудительные completeSettle на DOWN | 1 | 0 |
| Старый job остаётся владельцем | нет | да |
| CPU второго UP | 78.1ms | 81.2ms |

Контрольное чтение5×5 default framebuffer выполняется только ПОСЛЕ настоящего
DOWN. Все25 pixels содержат новый фиолетовый пигмент. Между первым UP и вторым
DOWN никаких readPixels/finish-проб не добавлялось. Read после DOWN синхронизирует
GPU и влияет на последующую нагрузку: это upper bound готовности GPU pixels,
не физическая задержка пера, compositor latency или доказательство FPS/morphing.

Нормализованные физические материалы/packed dabs/wet совпали. Все38 retained
field roles с реальными dimensions/nonzero и byte SHA совпали; wholeRGBA совпал.
В обеих arms actual UI Dry, смысловой Undo единственного pigment stroke,
Redo и свежий reader прошли. Undo даёт нулевой pigment alpha (остаётся только вода),
подтверждён exact target/state; Redo/fresh возвращают тот же wholeRGBA. IDs уникальны,
ACK и REST сохранённых room-specific полных payload проверены, GL0/lostfalse.

Первый failed run сохранён: inherited pigment→pigment nonempty-Undo gate ошибочно
отвергал допустимый пустой pigment export water→pigment. Исправление усиливает
проверку конкретного target и нулевого alpha; не скрывает изменение модели.
HOME-запуск отдельно прерван потерей ноутбука до native tape, не считается PASS.

Raw: temp/fast-watercolor-night/mixed-vpn-surface-v2/report.json.
Следующие обязательные проверки: pigment→pigment другой RGB/нажим/nib, water-only,
быстрые последовательные жесты, rejected admission на другой wash/layer/remote,
Samsung и несколько участников. Один Surface fixture не разрешает включить flag
всем и не подтверждает произвольные промежуточные состояния/анимацию.
