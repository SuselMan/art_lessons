# Итог проверки луж и undo — проект отчёта

Проверяется согласованная версия undo мокрых акварельных жестов, redo на исходном месте истории, послойная операция сушки и ластик сухой основы. Это отдельная работа внутри #728, без общей сертификации модели акварели.

Исходники: runtime64cf7cc3 (включает550b1284,d1e791cc,a425beb1), backend4ae8919d. Только локальные коммиты, production не обновлялся.

Автоматические проверки: до последнего исправления205тестов/15файлов, после hydration175/9файлов включая8новых исторических и1 engine-регрессию; это пересекающиеся выборки. Typecheck всех workspace,e2e,scripts и lint прошли.

Реальное железо: AMD Vega/OpenGL (Linux Chrome155) и Surface IntelIrisXe/D3D11. Исходный Vega17targetcheckpoint прошёл; Surface16 прошёл,17th test invalid because naturaldry162512ms>120000. Новый focusedscope исключает истечение времени. MidstrokeDryVega3checks exactactual/replay, noGhostVega7checks pass.

Найдено/исправлено: потеря target метаопераций при snapshotloading (backend4ae8919d); latebackfill target afterheldundo resurrectedcancelledstroke (a425beb1+64cf7cc3); implicitoriginalstrokechunk reuse acrossdrybarrier; penup deferrebuild forpeerDry undermidgesture; checkpoints/visibility boundaries.

Оставшийся известный блокер: AMD/Intel сухие target не побайтно одинаковые. Перед исправлением hydration 4непустыхслоя разошлись max16/37/17/10 на8bitканал. Это не признано нормой; окончательная межустройственная детерминированность не подтверждена. На одномGPU wrongrejoin мог давать12229изменённыхканалов/max241, отдельный отcrossGPUбаг; егоисправлениепроверяетсяfocused.

Ограничения адаптера: не больше2мокрыхслоёв, квадратныйsingle tile<=1024. Естественное высыхание120с от последнего мазка слоя, а не отдельной лужи. Обычные инструменты прежним образом закрепляют мокрую порцию; исключение — ластик. Независимые естественные часы луж, merge/transform/annotation/performance всех устройств не заявляются проверенными.

Ресурсы: pendingfinalcleanup owncontexts+Chromeprofiles+SSHforwards+rooms/auth. ExistingQAservices5383/5384/4558remainforIlya; no newpersistentservices. RawGPUbuffersdeleted aftercompactevidence.
