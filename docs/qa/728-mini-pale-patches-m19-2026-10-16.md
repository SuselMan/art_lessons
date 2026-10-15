# Светлые пятна после М16: диагностика и М19

Обратная связь Ильи00:33: М16 не убрал светлые пятна. Это не опровергает GPUконтрпример uphillcarry, но показывает недостаточность правки. Не считать М16 решением всей жалобы.

## Что проверено

SamsungSM-T970, восемь быстрых касающихся синих мазков. Сохранены изображение сразу после последнегоUP и финальная RGBAцель до полного морфинга. Пятна появляются уже в цели, не только в presentation. Это воспроизведение нашего образца, не точного пользовательского ввода.

В traceМ16 на публикациях15/18операций центральные границы почти ровные; к33 после native remobilization/bloom/diffuse/settle phase возникает выраженный рваный пятнистый рисунок. Поздние72/90/99 и фон106 его уже существенно не меняют. Первая группа traceops ошибочно включала liveinput доUP, её не использовать для точной атрибуции. Harness исправлен очищатьops послеUP; screenshotэтапы достоверны.

### Отрицательные варианты

М17 (historicalURLv17, не в селекторе): тот жеМ16, opticalRGB mobile=c.rgb*q вместо независимого positiveexcess. Пороги и Psplit неизменны. На singlepaintnativepath нет pairedcolourcarry, поэтому гипотеза не могла объяснить этот основной одноцветный случай; screenshot подтвердил сохранение пятен. Canonicalcancel0diff,dryisolation0diff,GL0,TSCPASS. Не считать исправлением.

М18 (historicalURLv18, не в селекторе): М16 с bloom=0 при prepare. Native bloom действительно намеренно вымывает светлый core с тёмным ободком, но отключение не устранило основную пятнистость. Убрана1операция. Canonicalcancel0diff,dryisolation0diff,GL0,TSCPASS. Не считать найденной главной причиной.

Диагностическая центральная ROI x240..780/y350..650: доля пикселей ярче исходного PNG на>8 уровней Rec709 sRGB luma: М16 36.99%,М17 37.11%,М18 37.01%. Разные живые вводы между версиями, поэтому это не точное sameinputA/B и не метрика художественного качества. Локальные PNG raw/goal одной версии сопоставимы. Screenshotreadback и диагностические вызовы искажают frame timing; их latency не использовать.

## М19 — полная концентрация и в diffusion

М16 исправлял только carry15/16. Native diffuse по-прежнему переносит suspension по mobilealone, density/solvent параметры в реализации игнорируются. Поэтому прежний mobile-vs-total контрпример остаётся на следующем этапе.

GPU2×1тест, одинаковая вода, mobile20/51,fixed153/0 (total173/51): native diffuse→23/48 (3единицы из светлого в тёмный); М19→18/53 (2 из тёмного в светлый), суммаmobile71 в обоих, GL0. Harnessmini-diffusion-direction.cjs PASS.

М19 основан непосредственно наМ16, без отрицательных измененийМ17/18. Внутри native job перехватывается ссылка на fixedP из carry15. Diffusion читает Pmobile+fixed и solvent для потенциала, а переносит только доступную mobileдолю каждого канала. Пары имеют одинаковый flux с противоположных сторон; cap каждой donorface<=.12 (8faces<=.96 до RGBA8). Бумажный downhill влияет на скорость, но не разрешает перенос против totalconcentration. При отсутствии fixed/density вызывается native; при отсутствии solventпотенциал использует плотность, при solventfloor.02. Параметры/порог заморозки этих приближений не физически откалиброваны. Callbackhooks восстановленыfinally, resetсбрасываетfixed; backgroundpostops остаются native.

+1shaderprogram/3texturesamplers, без новых постоянных полей относительноМ16. Nativefront/carry/brush и исходныйphase split сохранены. Одна цель из rawвсехмазков, без очереди, priorgoal/elapsed morph не исходник. М15/16 сохранены.

## Результат и пределы

М19 series8 goal603.8мс/106ops,Dry1209.8мс; screenshotdiagnostic maxrAF116.2мс не пользовательский performancebaseline. TypeScript PASS, canonicalcancel P/C/coverage0diff, dryisolation0diff, GL0/errors0/context retained. ТолькоSamsung.

Цель просмотрена: пятнистый рисунок стал слабее, но отдельные ровные границы мазков заметнее. Общее осветление НЕ решено: в той же ROIlighter>8=50.77%, meanluma+7.90 противМ16+5.29; различается и исходный живойввод. Нельзя объявлятьМ19 художественным улучшением или устранениемсветлыхпятен. Это вариант для человеческого сравнения корректного направления и силыживогосмешивания. Светлыеобласти могут идти из потери/перераспределения массы, fullresolutionreconstruction, соотношения Pканалов и композита, а не только fluxdirection. Эти причины ещё не локализованы дооператора.

Далее нужен sameinputmaterial/opticalbudget по этапам (полныеP/Cмассы, brightROI относительноraw), особенно после split/remob/settleslices/downsampleupsample; не очередная замена порогов без доказательства.

Onlineготовность не заявляется: canonicalgoalcancelпроверен наодномGPU, localdrymembershipclock Mini остаётся прежним; параметры должны стать частью канонической модели/журнала до roomintegration. Никакого productiondeploy/push. Галерея не пересчитывалась.

Evidence temp/device-runs/mini-{coupled-m17,nobloom-m18,total-diffuse-m19}-20261016. СохраненыкомпактныеJSON и ключевыеPNG; собственныеCDPстраницы/ADBпорты/typechecktemps закрыты, общий зарегистрированныйQAstaticbuild оставлен.
