# М20: фоновое смешивание при отключённых контрастных источниках

Запрос Ильи00:56: М15 с massThreshold=compositionThreshold=hueThreshold=1,hueStrength=.55,backgroundStrength=1,PB15,#2688d3,water100,pigment69 почти не сглаживает штрих.

## Причина и изменение

В М15 исходная eligibility разрешает мокрые области без выбранных источников. Затем дополнительная motionmask запрещает фон там, где nativegoal заметно отличается отraw — даже если все пороги источников отключены. Пятый ползунок меняет амплитуду только оставшегосяdelta, не может снять запретмаски.

М20 = М15 с единственным изменением backgroundpoststage: gate копируется прямо из исходнойeligibility; поздняя motionmask удалена. Источники при обычных порогах по-прежнему защищены initialpeakmask+12pxmargin. При трёхпорогах1 sourceq0, поэтому фон может работать по всей исходной мокрой области. Математика carry/diffuse не изменена наМ16/19; nativeМ15сохранён. ЧетыреdiffuseP/Cпары и реконструкция lowdelta остаются прежними. Добавочныхops/буферов нет; один protectshader удалён.

## SamsungSM-T970

Точные настройки Ильи, 8касающихсямазков, harnessmini-background-mask.cjs. М15gateactive8741/65536pixels,averagegate22.18/255,changedPbytes31073,maxchange97. М20gateactive17256,average66.24,changedPbytes68141,maxchange163. Разные живые вводы; не sameinputbyteA/B. Readbackподтверждает более широкое включениеbackground, не гарантирует желаемую художественнуюсилу. Снимки просмотрены: границы тональныхполос вМ20сглажены заметнее.

М15запуск прервался foregroundAndroidapp: maxframe50сек нельзя использовать дляperf, послеChromeforegroundтест завершён. М20goal587.7мс/106ops,Dry1200.8мс,maxrAF59.7мс, warmDOWN1–3.5мс. Нет доказательства ускорения. GPUreadbacks сами влияют наlatency.

PrototypeTSCPASS. М20canonicalcancel0diffP/C/coverage, dryisolation0diffduring/after,GL0/errors0/contextretained. Эти дваsmoke наdefaultпорогах; exactthresholds проверялисьсерией. Onlinecrossdeviceнепроверен, localdryclockконтрактMiniпрежний.

М15сохранена, М20отдельныйселектор/URLv20. Ниproductionнигалереюнеменяли. Evidence temp/device-runs/mini-background-mask-m20-20261016:2PNG+JSON. Ownpages/ADBports/typechecktemporaryзакрыты, registeredstaticbuildостался.
