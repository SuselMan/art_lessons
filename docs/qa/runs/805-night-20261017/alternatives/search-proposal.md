# #805: bounded program search, отдельно от12parameterconfigs

Первоначальныйэтапбылsource-only приfrozeninitialGPUcopy. ПослеявногоGO
добавленотдельныйregistryid `search-artistic-program`: онреальноисполняет
`lower(program)`, compileconstant4/8frontshader иoptionalrim. Ordinaryтри
алгоритманеизменены; initialGPUbuildcopyнепересобиралсяэтойправкой. GPUruns
агентомнепроводились. НижепервоначальныйпланиподтверждённаяCPUреализация.

DSL описывает реальные разныепрограммы: axial4 или8-neighbour front shader;
триfrontpasssequences `[8,4,2,1,1]`, `[4,2,1,1]`, `[4,2,1]`;
двеtransportsequences `[1,1,1,1]`/`[4,2,1,1]`; optionalrimoperation.
Получается2×3×2×2=24программы. Они меняютграфопераций/выбороператора,
а не только вещественныеrim/stepsползунки. `lower` создаётточныйorderedplan;
`programConfig`/`programFromConfig` roundtripкодируютегочисловымпротоколом.
Реализованныйapprovedadapter compile4/8операторыдоtiming иисполняет
именноэтотfrozenplan. НеобязательноunrollGLSL:вариантоператораиsequenceужеявляются
элементамипространствапрограмм. МежпроходноеRGBA8квантование сохраняется.

Критичнаязащитаотfalsepositive: initialartistic kernel покаигнорируетнеизвестные
configkeys. Поэтому`requireProgramSupport` отвергаетего: отдельныйadapter
attest DSLversion/fingerprint/actualpasscount ДОизмерения. Нельзя просто
передать24numericconfigsстаромуядру ивыдать24одинаковыхrunзаprogramsearch.

`evaluateFixture` немедленно сжимаетRGBA вметрики: rejectblank приpigmentinput,
любуюpigmentgenerationизнулевогоRGBA, premulinvalid, massratioвне[.5,1.5]
(defaultcatastropheguard, ненормакачества), nondeterministicrepeats, недостающие
repeat/dependenttime. Blankводабезпигментадолжнаостатьсяblank — здесьнетwater
outputchannel, поэтомупроверяетсяименноzero-pigmentinvariant, не conservation
самойводы. Dry/blankcontrolsмогуттребоватьexactidentity; wetfixture — visiblechange.
СкоростьнеберётсяизCPUproxy, submit/gl.finish невыдаютсязавыполнениеGPU.

`search` исполняетпоследовательно≤24programbenchmarks, междунимипроверяет
quota/stop; одинаковыйнаборfixtures обязателен. DriverвладеетреальнымGPU,
compile/uploadвнетаймера, dependentcompletionprotocol иPNGпослетаймера.
RGBAмеждупрограммаминеудерживается. Paretoминимизируетlatency+massdeviation;
coverage/centroid/edge/chromaостаютсявидимыми. Максимумшумаиликрая невыдаётся
заэстетическоекачество. Humanimageapproval иcrossGPUdeterminism остаются
отдельнымигейтами; numericfrontier неавтоматическиготовыйпродукт.

## Почему это не формальныйSTOKE

[STOKE, Schkufza/Sharma/Aiken2013](https://theory.stanford.edu/~aiken/publications/papers/asplos13.pdf)
ищетmachinecodeварианты сcorrectness/equivalenceцелью, тестами ивалидацией.
Нашиновыеfront/diffusion/rimпрограммы НАМЕРЕННОменяютрезультат: требование
старыхпикселейснято. СложныйshaderFP/UNORM/filtering/driversemantics плюс
художественныйкритерийнеимеютздесьSMTspec/referenceequivalencepredicate.
Называть24approximateDSLпрограммыформальнойsuperoptimizationбылобыневерно.
Точнаяформулировка: bounded approximate program synthesis/autotuning с
проверяемымифизическимиограничениями иручнымотборомкачества.

[Halide autoscheduler2019](https://halide-lang.org/papers/autoscheduler2019.html)
ищетрасписаниявявномпространствесcostmodel, обычнонеизменяяalgorithm.
Здесьменяетсяисамалгоритм(соседство/опущенныйrim), такчтоточныйHalide-аналог
тоженеподходит. Это ближе кпоискумалойразрешённойDSLсемьипрограмм.
ПровереноCPUsyntax/type/roundtrip/cap/reject/Pareto; ниGPUбыстродействие,
ниформальнаяэквивалентность, нипобедавкачествепокаНЕпроверены.

Обновление805: protocol допускаетoptical-densityвместоpremultiplied-RGB.
ТранспортлинейныхC-векторовнепотребовализмененияkernels/DSL. МетрикиmassA,
premulconstraintиcoverageостаютсяфизическиминаблюдениями; `chromaVariance`
дляC — толькоразбросканаловdensity, НЕRGBнасыщенность/художественнаяоценка.
Человеческийотбордолженсмотретьrendererexp(-4*C) root, несырыеканалыC.

## CPUadapterпроверкапослеGO

Все24config реальносоздаютсячерезотдельныйregistry иFakeGLdrawtrace
сравниваетсясoperationkind/stride/compiled4-or8source длякаждогоloweredstep.
requireProgramSupportPASS, metadatafingerprint/passcountизтойжемассиваопераций.
Диапазон10–13passes; defaultordinaryart остаётся17. CPUникакнеподтверждает
корректнуюкомпиляциюGLSLдрайвером, качествоилиускорение. StrictTS0errors.
