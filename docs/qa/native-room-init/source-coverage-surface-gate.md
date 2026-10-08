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
