# Macro38: раскладка вертикальных single-pair invocation

Macro33 сохранял x как pairCoord для обеих осей. На вертикальной phase соседние gid.x выбирали разные строки с расстоянием2*128*48bytes между первыми Cell; соседние lanes одной группы плохо совпадали с последовательными ячейками lineX. Это **гипотеза причины**, а не установленный performance bottleneck: coarse matrix0.75MiB может попадать вcache, компилятор/частоты/overhead также влияют.

Новый strict source transform меняет толькоmapping: axis=phase%2; pairCoord=vertical?gid.y:gid.x; line=vertical?gid.x:gid.y; bounds pairCoord<=n/2,line<n. First=2pairCoord−offset; ia/ib/singleton используют line. Вертикальные последовательные gid.x теперь читают/пишут соседние lineX; horizontal mapping полностью прежний. Host dispatch16×16workgroups неизменён, лишние threads возвращаютсядоsrc/aux reads. Ширинаactiveband меняетсяcolumns→rows наverticalphase, не числоtasks.

Actual material helpers/arithmetic/rounding/двеwrites/сingletonadsorb дословно macro33. Новые Lite/Fine4 IDs `wgsl-macro-coalesced-single-pair-dt` / `...-fine`; экспорт coalescedSinglePairDefinitions. Actual factories теже FastLite/compactSmoothFine/coherentψ upload; толькоpairSource override. Shared33/exact-pair-dispatch/kernel/registry не меняются.

CPU: всеdestN128 каждойH0/V0/H1/V1 записаны ровно1раз, singleton2*N дляoffset1; наборcanonicalpairs одинаков33 при иномпорядке. Строго обратимый source transform восстанавливает macro33 bytes, helpers/арифметика неизменны.32phase actual physicalDtPair CPUoracle на128²cells сравнивает independentlystepped33/38 states сborderadsorption. Actual factorytests сравнивают sourceSHA, всеother pipeline sources, uploads/field, buffers иdispatches Lite/Fine4. WGSLreservednames clean. Это не драйверная компиляция и не GPU exactness/performance.

ПервыйGPUplan:4новыхrequests mini-wave/dynamic-two-strokes×Lite/Fine4, сравнениеwholeRGBA с33 и30/31 samecfg, sourceSHA/ledger/cleanup. Старый33 afterpause не выиграл, поэтому новыйвариант не должен называться ускорением до парногоизмерения; горизонтальная половина фаз не оптимизирована этим mapping.
