# Wet-gated nine-point diffusion: CPU addition, не готовый GPU solver

Сохраняет independent-density oracle и отдельный raw ledger из [density CPU](../dense-density/README.md). GPU/worker/entry не менялись. Перенос и локальное смешение различаются: advection меняет расположение/форму supports, diffusion обменивается плотностью только между мокрыми непосредственными соседями. Последняя сама по себе не обеспечивает макроскопический50–150px перенос.

## Согласованные stencil weights (Q16)

Порядок cumulative apportion: center,N,E,S,W,NW,NE,SE,SW.

| Level | center | каждый axial | каждый diagonal | off-center сумма |
|---|---:|---:|---:|---:|
|0 control|65536|0|0|0|
|1 small|55296|2048|512|10240/65536=.15625|
|2 larger|24576|8192|2048|40960/65536=.625|

Во всех сумма65536, axial:diagonal4:1. Это привычный более округлый real-valued stencil, **не formal isotropy** при integer rounding, finite boundary, wet obstacles. При полностью мокром бесконечном real-valued поле variance накоординату зашаг .09375/.375; за8шагов соответствующий RMS .866/1.732px. Эти числа описывают локальный smoothing, не fitted художественный score.

Каждый из четырёх raw density каналов разбивается по9 cumulativeweights темже exact `mulWeight16` decomposition. Все blocked/out-of-bounds shares возвращаются в donor. Sourcewater0 никуда не переносится, входящие не проходят вdry. Для diagonal применяется тотже integer supercover: дваside-cell должныбытьwet. Поэтому alpha-cap не вводится, четыре глобальные суммы сохраняются и receiver≤globalSum<2³¹. Premul-фильтра здесь нет: D.rgb/M независимы.

## Контакт и расстояние supports

`cpu-observations.json`:8последовательных этапов advection→diffusion, raw threshold строго>0 (не порог PNG). `two-pixel-gap.png` и `advected-blobs.png`: слева control0, центр small, справа larger; CPU exp display,3×nearest. Эти примитивные картинки проверяют компоненты модели, не доказывают акварельное качество.

| Scene | Control0 mixedpixels | Small | Larger |
|---|---:|---:|---:|
|Touching rectangular patches (0emptycells)|0|359|499|
|2emptycells gap|0|275|410|
|24emptycells gap|0|0|0|
|Separated blobs, supplied converging/shear advection|0|9|37|

Для зазора24 после8шагов минимальное Chebyshevрасстояние rawsupports остаётся15/12cells (control25), поэтому отсутствиеmix не ошибка. Дляadvectedblobs controlsupports уже adjacent(distance1), small/larger дают overlap9/146 densitycodes соответственно. Это **очень слабое** смешение краёв, не уверенное смешение bodies. Touching/gap2контроль отдельно подтверждает, что оператор вообще способен обменивать цвета при встрече. Все4rawсуммы во всех12случаях совпадаютдо/после.

## Важное численное ограничение, не прятать за PASS

Cumulative apportion не является точно симметричным integer operator. Single-step transpose на неоднородном128²поле:small21680/larger11991changedchannels,max4rawcodes (=.5inputbyte). При wet-boundary общий теоретический bound сравнения≤16rawcodes: packet одного donor меняетсямаксимумна1, до8openincoming+8возвращённыхselfshares. Наfullywet centerfixed boundещёменьше. Это не rotation theorem.

**Constant weak density8 (=1inputbyte)** около drywall меняетсяна1rawcode зашаг; после8шагов maxchange8/7rawcodes. Глобальные суммы приэтомexact. Это artificialboundaryredistribution у квантованного слабого поля, ане реальное adsorption/coffee-ring. Уполностьюнулевого материала phantomcolour не появляется, но слабыйпигментможетполучить нежелательнуюкромку. Поэтому нельзявыдать модельза художественныйуспех или перейти кGPUпооднимledgerguards.

Возможный следующий **не реализованный** численныйcontrol: тотжеrealstencil как antisymmetric edgeflux `sign(Cj−Ci)*floor(abs(Cj−Ci)*weight/65536)`. Он могбысохранитьconstantfield/D4exact, ноимелбыquantizationdeadzone слабыхградиентов; отдельное CPUрешение/GO требуется. Текущий agreedcumulativeоператорнеподменён.

## Стоимость/следующий GPU contract

CPU typed-array liveness diffusion отдельно: input16N+wetN+output16N=33Nbytes; combineddriver дополнительноvelocity8N и удерживаемыеtemporaryarrays/GC, не прогнозdeviceRSS. GPU diffusion возможна gather-формой безatomic: receiver вычисляет собственнуюостаточнуючасть иоткрытыеpacketshares8соседей. Чтобыобъявитьеёexactcurrent scatter, нужен независимыйCPUequivalenceproof. Онамоглабыиспользоватьужеимеющиесяdensityping/pongбездополнительныхfieldbuffers, ноэтоНЕреализованнаяGPUоптимизация. Прямойscatterвариантпотребовалбыдо36positiveatomicadds/donor/step; вместе сadvection worstcase дорого. Никакихtimingclaims.

Для будущегоGPU нужен **новыйdensity-probe outputcontract**, неpremulbytecarrier. Rawu32×4 иегоSHA/4ledgerотдельно, display opaqueRGBA/LUTотдельно. OldmassRatio/invalidPremulнеприменимы. CPUPNGиспользуетMath.exp только длявизуализации; это неcrossGPUbyteproof.

Проверка:5CPUtestsPASS(~1s):exactweights/control0;touch/gap/far;all4channels/globalbound/RGB>M;wateronly/dry/wall/corner;measuredtransposebias. StrictTypeScript/noUnused0. `dense-density-diffusion-audit.cjs` воспроизводитJSON+2PNG. НетGPU/устройств/сервисов/dependencycopies/остающихсяпроцессов.
