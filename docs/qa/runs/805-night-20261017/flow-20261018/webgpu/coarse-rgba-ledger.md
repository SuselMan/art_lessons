# Coarse RGBA ledger: закрытие пробела фактической GPU-проверки

Ранее GPU readback macro8/9/14 суммировал лишь alpha M+D и W+S. Поканальная консервация RGB была проверена CPU-oracles, а fine имел собственный ledger; это не было измерением всех4каналов coarse GPU state. Новый ledger не меняет WGSL, source hash metadata, ψ/field, upload bytes, GPU buffers или команды.

Оба initializer (старый macro8 и exact fast macro20) добавляют `initialCoarsePigmentCodesRGBA`, вычисленный из **реально подготовленного state** (M4+D4), после freeze decision. Frozen/stationary literal не учитывается как coarse mobile pigment. Отдельная небольшая CPU reduction0.75MiB state добавляет диагностическую работу в подготовку; это не бесплатное ускорение. Arrays копируются во внутренний snapshot при upload и во внешний metadata getter; внешняя мутация не подменяет baseline.

Readback macro8/9/14 использует уже существующий полный mapped stateStaging **вне таймера**. Новых GPU копий/map/read нет. Поля:

- прежние surface/absorbed/mobileAlpha/adsorbedAlpha/totalWater/totalPigmentAlpha сохранены;
- `coarsePigmentCodesRGBA` — текущиеΣ(M+D)4канала; `coarsePigmentDeltaRGBA` — signed разность с initial;
- `coarsePigmentConserved`, `coarseWaterConserved` — точное равенство;
- counts `coarseOutOfRangeCells` (u32 values>65535), `coarseInvalidPremulCells` (отдельно M/D RGB>A), `coarseRepresentationOverflowCells` (M.a+D.a>65535);
- `coarseGuardPassed` и `prePackGuardPassed` — conjunction mass/water/bounds/premul и ранее failed guard, а не замена предыдущего false наtrue.

Это **не** проверка конкретной stationarity-derived aux.capacity каждого cell: aux не читается заново. Она остаётся свойством исходного kernel/CPU proofs. Не проверяется сохранение окончательных RGBA8 sums после реконструкции/квантизации; они по определению отличаются от coarse u16. Stationary slot source readonly в shader, literal ввод не входит в coarse baseline.

Новый regression: изменён только R в mapped state при неизменных A/W → guardfalse и delta[-1,0,0,0]. M→D transfer сохраняет все4суммы → true. Water-only drift, rawu32 overflow, premul, combinedA overflow и previous false также выявляются. Actual8/9/14 factory mocks используют прежние2GPU copies+2maps (output и coarse state), metadata arrays не позволяют подменить guard, все owned buffers освобождаются.

Проверки:65 tests PASS в18файлах (maxConcurrency2,50.1сек), включая old/fast13реальных исходных карт с deepEqual всехbytes/summary; strict TypeScript и scoped oxlint0. WGSL literals/actual pair source assertions остались прежними. Физическая GPU-проверка новых полей ещё не выполнена; следующий existingstress replay должен подтвердить, что поля действительно присутствуют и guard участвует в оценке.
