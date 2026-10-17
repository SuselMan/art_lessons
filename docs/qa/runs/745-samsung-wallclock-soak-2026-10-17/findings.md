#745 — реальный получасовой Samsung soak

Source43f87295, backendac892525. Native Adreno650, DPR2.125,300MiB, оба diagnostic flags OFF.10реальных Socket.IO identities, один native Samsung observer; это не10браузеров.180циклов каждые10сек, в каждом Promise.all трёх rotatingавторов,8dabs/штрих;540M70штрихов,548принятых операций. Несколько ROI и общие пересечения; вода/низкодозный пигмент чередовались.

Реальные30мин:1808497мс до конца финального контрольного oracle. Undo→Redo около5/15/25мин, recorded layerDry около15мин. Поэтому две непрерывные мокрые эпохи по≈15мин, не одна30-минутная лужа без сушки. Observer всё время visible; WebGL context не терялся; Runtime.exceptionThrown errors[]; GL0. Синтетическое state.errors0 не является самостоятельной метрикой.

Три gates: до midpointDry, финал30мин, один cold rejoin. Actual physical прочитан первым; canonical goal сохранён ДО независимого OFF fullAPI replay;0изменённых каналов/max0 во всех3gates. Дополнительных goal computations при чтении0. Final/cold actualSHA совпадает:ab3fd6ecca00df3863a4c6eba702811372965a32ad4f1f322ceae9c1e716c775. API/local ID counts+order hashes совпадают,548ops на финале/cold. PhysicalHash отличается отgoal во время morphing; physicalexact не заявляется.

Midpoint контрольный GPU replay — явное вмешательство, поэтому это не полностью непрерывный GPU workload без проверки. Oracle использовал временный log/отдельный replaytarget; исходный observer log восстановлен, его материал не заменялся. Это correctness soak, не isolated latency benchmark. #785mixednative не добавлялся, остаётся CPU-only.

Cleanup: owner room DELETE200;10Socket.io авторов/ownbrowsercontext закрыты, originaltab восстановлен; private state auth удалён. Свой local19335 SSH forward остановлен; QAremote9235/userChrome не тронуты. Raw exactID745-samsung-wallclock-soak-20261017 передан для guarded finish.
