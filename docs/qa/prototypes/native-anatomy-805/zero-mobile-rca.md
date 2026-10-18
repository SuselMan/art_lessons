# Почему mini-wave показывает пустые карты переноса

Actual Samsung trace/snapshot replay (native-stage-805-20261018, snapshots-replay и snapshots-extra); это вывод для компоненты0 именно этой сцены, не всех мазков.

- Aligned C, contrast reference C и stitched current C имеют один SHA `dd68bc70b4524add43a208b75563b219aec1bbfc674121fce1018dd2ae594ac8`.
- Aligned P, reference P, stitched a и b имеют один SHA `34fe9f5c093faf074b6b87bbec5b0030a476babbe5c78cbcc83942eeda9b5b8c`.
- Q до CPU-фильтра ненулевая. Независимый CPU BFS по actual Q: порог R≥6,8-connected,1604клетки/54компоненты;10крупнейших129,129,127,126,117,115,99,99,98,76. В actual trace minCells188; ни одна не проходит. Это точно алгоритм retainedComponents.ts, не визуальная оценка.
- Uploaded regionKeep полностью0. Поэтому reference=current; mode0 `max(a-b,0)*mobileShare` даёт нулевой mobile seed ещё ДОfront.
- Outward pressure.R=255 на всех1048576пикселях. Band и carry/diffusion mobileP все0. Тaps читают actual destination синхронно после producer: позднее переиспользование алиасов здесь не объясняет нули.

Нельзя показывать эти пустые изображения как доказательство художественного переноса. Расчёт проходов выполнен, но эффект front/carry в этой компоненте не активирован фильтром площади. Изменение конечного изображения может идти через реконструкцию/фон; оно не доказывает перенос в carry. Для демонстрации активного и парного переноса нужна отдельная фактическая сцена mini-two-colors с собственными trace/seed/snapshots и finalRAW P/C/coverage equality gate.

Предыдущее сравнение reference C с полным исходным мазком некорректно: надо сравнивать с тем же component-masked aligned C. Исторические snapshots не заменяются и не дорисовываются. Ни параметры фильтра, ни physics, ни source inputs ради картинки не изменены.
