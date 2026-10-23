# Выбранная акварель: фиксация и техническая очередь

PR721 merged: 098de86ae914db434b17ae680432d76fe5bd9bc3. Source2e6a6706. CI test/e2e PASS. Deploy run37301957573 SUCCESS. Фактический grafetto.com/version.json: 2026.10.05-098de86, SHA098de86ae914db434b17ae680432d76fe5bd9bc3; api/health oktrue/dbup.

Выбран symmetric-face + optical55. CPU H proxy67 оставлен исследованием, не live solver. Проверки source parity PNG/all four P/C phases exact на 6/6,9/3,7/3,4/1. Samsung salted compile/link9/9 GL0. Typecheck/lint/map/full3467unit и publisher8PASS.

Живой рисунок, undo/redo, перезаход: фактические4gestures/GL0. Candidatev4original→redo43px,max16; redo→rejoin8025px,max106, overlapblue/green. Oldpointer86407px redo, но old1wash и candidate3wash из-за времени обработки: сравнение НЕ строгое. Нельзя объявлять regressionexcluded или exactlivePASS. Same EXACTcandidate4ops3wash coldappend→fullrebuild безcheckpoint→repeatexport BYTEexact на BOTHold7ca и new2e. foreignSources counts/geometry exact. Это различие liveauthor vsrecordedreplay, не расхождение двух recordedpaths. Данные selected-live-qa/same-ops-cold-qc.json и rejoin-state-audit-v2/report.json.

DryWash дев-оракул неидемпотентен: повторный вызов применяетgroupTide снова, dryCtx не инвалидируется. Не трактовать повторDryWash как lateUIbug. DryAll снимаетwater/sheennotgroupTide.

Технические приоритеты: #681 liveauthor vsrecorded. Проверить exactliveCPUdouble vsFloat32committedTape, промежуточные livebatch/composite и snapshot сохраненияmixedforeignwash. Сначала matched wash boundaries, без случайного wall-clock конфаунда; не менять Dabконтракт или глобальноfround без причинного доказательства.

#324 settlement latency: Vega короткий matched100/400 rAFp95old/new22.2/16.8 и22.3/22.2ms; completion1.174/3.462 и1.145/2.500s. Стало дороже2–3×, кадры неухудшились в этомпрогоне, планшетныйFPS не измерен. Главныеcostdrivers0.5Rcontacts+CFLmicrosteps+sharedall8capacityshader. Урезатьmicrosteps/mix/gain/stride значит изменитьвыбранныйрисунок. Следующийпрофильablations/timestamps/boundedGLunits без readback внутриpaint. Необъявлятьидеальнуюплавность или релизготовность.
