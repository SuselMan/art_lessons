# Узкая локализация покрытия на Surface

Immutable source 182c5644, bundle SHA bcfbb97e5fff64609eb1850b8232f96dd36ec8a2f38d8a0984f808f673149884. Исходная сохранённая операция: 78 packed dabs, 145 команд. Fine LA SHA aeaef351114f00eb372208f68ff9ed809ab4cd3d0c86c02bb60e31fb21df8521. Вызов runSourceCoverage с indices23–44 (релевантная матрица),83/85/87; неизменённая модель, DITHER ON. Полного author/settle не было.

Surface hardware gate завершён без validation errors, minimum available RAM1496MiB. Собственная вкладка закрыта. valid означает завершение проверки, не byte parity.

Первая разница в целевой точке world572/435 возникает именно на **ribbon44**. На одинаковом предыдущем GL покрытии [0,0,6,6] native пишет [0,0,9,9], GL [0,0,10,10]. Эта команда отличается в двух R, одном B и одном A byte; max1. Предыдущие релевантные команды35–43 в этой точке совпадают. Это локализует один upstream источник ранее обнаруженной разницы pressure100/98; не доказывает причину остальных pressure142/139 или246/243.

Stamp37 также имеет32 B и32 A различия в других точках (max5), но целевые probes там совпадают. Поэтому единая гипотеза stamp sin/cos недостаточна. Следующий шаг: supplied ribbon44 vertices/interpolation/fragment math при том же previousGL input. Отдельно необходимы координаты первого B/A mismatch stamp37.

Полный raw: temp/device-runs/native-source-only-surface/report.json (игнорируется Git). Машиночитаемые выбранные строки: source-coverage-surface-summary.json. Это source-only primitive fidelity, не обычная Room400, не показатель производительности и не исправление качества.

## Следующая диагностическая граница

Read-only source audit: stride44, offsets0/8/12/16/20/24/28/32 и Float32 локализация совпадают с production GL. Snapped позиция1/64 и resolution1024 сохраняют двоичные координаты при обоих вариантах clip; generic literal clip rewrite без данных здесь не оправдан.

CPU barycentric анализ исходной команды44 в центре world572.5/435.5 обнаружил шесть перекрывающихся треугольников:9,58,155,207,255,303. Первые четыре имеют edge≈3, последние edge≈2.613097 и1.426937. Across лежит около−0.53664, pressure0.8; standing1. Значит наблюдаемая Q8 alpha зависит от контакта щетины и шести последовательных OVER, а не только от края геометрии.

Callable следующей проверки: runSourceCoverage({operation:fixture.operation,indices:[44],probeSites:[[572,435]],ditherBoth:true,debugRibbonTriangles:[9,58,155,207,255,303]}). Только диагностический fragment output заменён24-bit RGB encoding для amplifiedAcross/edge/tip/amount, alpha1; geometry, uniforms и функции unchanged. Это не float framebuffer:24-bit наблюдения имеют собственную границу округления. GL DITHER ON/OFF проверяется отдельно в штатной последовательности. Software WGSL compilation+render pipelines4/4 PASS; CPU guards2tests PASS; hardware этого диагностического шага ещё не запускался.

## Actual Surface triangle diagnostics, 4b123e4e

Immutable bundle SHA ee740c01883114b58ac02458e46cc98a20bf8ba48077f4eb471b437d441fe2a0, Fine and operation unchanged. ONE gate completed, errors[], min available1563.4MiB, own tab closed. DITHER ON/OFF both reproduce native9/GL10 in target: dithering does not explain this site.

Actual triangle58 amount: native0.00195902598 versus GL0.00196731102. The Q8 source half-byte threshold1/510≈0.00196078431 lies between them: ×255 gives0.4995516 versus0.5016643. All other five intersecting triangles stay on the same source-Q8 side. This is concrete threshold localization, not an artistic water discrepancy or stamp trig.

Across/edge show tiny backend differences; edge/3 equals1 for triangle58. GL tip equals amount (fully covered). The exact responsible stage remains interpolation versus FBM/mix arithmetic. Amplified across diagnostic saturates at0 on triangles9/58; it cannot establish their equality. Need next diagnostic with unsaturated across and hair/noise components before changing arithmetic. Native/GL fragment compiler may optimize the diagnostic return differently;24-bit floor encoding is not exact float readback. Q8 source-before-blend interpretation is consistent with observed9/10, not yet a separate isolated driver blend proof.

Machine-readable actual results: ribbon44-surface-summary.json. Raw temp/device-runs/native-ribbon44-surface/report.json. No default/source/physics change, no Room or timing claim.

Следующий OFF diagnostic добавляет standalone1px OVER (sourceBlendAmounts обеимAPI передаются одинаково черезMath.fround). InitialB/A6, alpha≈.001959/.001967; ideal unquantized OVER оба ниже6.5, но source-alpha×255 лежат по разные стороны0.5. Это отделит driver source-quantization от финального framebuffer rounding. Дополнительные группы rawAcrossEncoded/hair/openingNoise/hairDrift, amplifiedAcross перемещён в unsaturated диапазон целевойtriangle58. Hardware этого шага ещё не выполнен.8/8 WGSL compile/pipeline software PASS, CPU guard3tests PASS, appTS/oxlint PASS.

Software-only scalar blend gate completed: exact same suppliedF32 values in GL and WebGPU give6 for both0.0019590261 and0.0019673111, as ideal final OVER predicts. This **does not confirm source-before-blend quantization** on SwiftShader. Hardware Surface scalar gate first attempt was invalid: controller expected an incorrectly expanded source hash; it closed its owned page without retaining results. No hardware verdict follows. f9ca5042 now verifies HTTP provenance against expected source before device creation and persists results before post-run validation. A repeat requires new explicit hardware handoff; no automatic retries.

## Valid Surface scalar blend + triangle58,90456c31

ONE retry used exact provenance hash read from file; trusted bundle SHA ddd2613203864cfc09e151fc4f33948ac8b0385f7bdfa85ef4784c05f54d9594, paper unchanged. Guard fixtures2/2 PASS before run. Valid hardware result errors[], min available1594.6MiB, own page closed.

Flat1px same source α0.001959026 gives6 in both APIs; α0.001967311 gives7 in both APIs, despite ideal unquantized final value6.48986<6.5. Thus this hardware converts/blends near threshold differently from ideal full-float final-round-only; the two APIs agree given the same source. Exact1/510 rounds differently due further driver precision, so do not generalize a universal source rounding law.

triangle58 actual edge/3=1 in both; rawAcrossEncoded24bit identical0.23167438696. Amplified across differs, but that expression itself has cancellation/FMA sensitivity and cannot establish exact varying bits. Hair native0.32103105313, GL0.32103325850; drift0.53178909610/0.53178891729; opening noise0.78077881222/0.78078036194 (opening remains saturated1). Tiny upstream hair/noise difference crosses the actual blend threshold. Need supplied identical-coordinate noise oracle to separate sampler/FBM algebra from interpolation; do not add epsilon or retune threshold.

Full actual selected diagnostics and flat blend outputs: ribbon58-blend-surface-summary.json. Software flat gate differs at near-half; hardware behavior must not be inferred from software. This remains one Surface source site, no fullRoom400/model-parity verdict.

Next callable noisePointOracle(owner) now supplies identical explicitF32 uniform coordinates to both APIs (drift/hair/opening points, no interpolated attributes). Captures four lattice values, fractions, noise and FBM24bit outputs. Literal GLSL helpers extracted from current RIBBON_FRAG; same WGSL common and baked251lattice. Software actual24rows all exact, errors[]: sampler/frac/noise/octaves work under identical inputs on SwiftShader. This excludes neither Surface compiler arithmetic nor inlined coordinate-expression differences.4guards PASS; no hardware invocation yet.
