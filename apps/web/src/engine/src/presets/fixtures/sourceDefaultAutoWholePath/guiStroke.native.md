# Реальный GUI штрих Default Auto

Samsung SM-T970, Krita 5.3.4.1, исходная `b) Basic-2 Opacity`, индекс 4,
**диаметр генератора 40, brush scale 1**. Исходный KPP 22371 bytes,
SHA256 `a4256e1954d7b21a6fc1fcbae35b46c0ab747e2f67a1576d9d587b6776e4aa11`
совпадает с файлом установленного официального ресурса и существующей stock
importer fixture. Дескриптор не клонировался из soft/Gaussian. Его SHA в новом
receipt — SHA JSON.stringify существующего оригинального importer descriptor;
это не заявление об аутентификации CAS или room admission.

Собственный документ 512×512 RGBA8, 300dpi, zoom100%, rotation0, прозрачный слой,
чёрный цвет, opacity100%, сглаживание None. Независимая векторная полилиния того
же процесса дала origin −924.75/−659.75 (точность ограничена записью SVG).
Реальный физический путь (973,756)→(1053,816) не подгонялся по PNG.
122 Android события source0x5002/device6/tool2 за 2025ms содержат действительные
binary32 биты координат и давления. Давление на индексах 0/40/80/120:
`.25/.5/1/.25`; UP0 не планируется как новая точка.

Источник задаёт antialias=true, manual precision5, automatic spacing coefficient
0.8, Opacity pressure curve identity, Flow constant1, Size unchecked. Поэтому
сохранённый старый 3.4 compiler для неисполняемых неидентичных Size curves не
подменяет ни одного активного численного потребителя этого теста.
Режим wash/over выводится из source PaintOpAction, creamy — из свежего отсутствия
global useCreamyAlphaDarken и pinned reader defaulttrue; tabletPressureCurve
также отсутствует, Samsung получает default identity. Ресурсная непрозрачность
берётся из снятого UI100%. Полные настройки оставались только в RAM.

После штриха экспорт текущей кисти из того же процесса подтвердил **все 169
stock params**. Собственный векторный контроль, KRA и PNG сохранены отдельно от
предыдущих неудачных диагностик Airbrush; новых повторных 512-картинок в Git нет.

SAME SourceStrokeAuthor с explicit native startup profile → MaterialAdapter →
CanonicalFrameEncoder даёт 20 отпечатков и 143 кадров. Существующие DefaultAuto
mask и fused32 creamy CPU composition дают SHA всех 1 048 576 RGBA bytes,
равный независимому GUI PNG:
`c97295e475d5df31db93c4b2c68a52d962b4c01096bc4866270e5eb8fd6c4c33`.
Различий 0, maxDelta0; 5089 видимых пикселей имеют частичную alpha, всего
255 различных alpha. Повтор после каждого yield через structured clone/resume
сохраняет ровно те же source steps, RNG, frames и draws.

Это одна реальная кисть и CPU проверка финального рисунка; нового GPU, редакторного
или серверного профиля этим доказательством не выдаётся.
Полные receipts: `temp/device-runs/krita-stroke-20261024/fixes-v52/`
`native-gui-stroke52/default58-*`, `source-author-receipt-default58.json`.
Собственный нативный документ закрыт; KRA/KPP удалены после сравнения байтов,
helper и зарегистрированная сборка удалены. Own preset resource status0
проверен RAM-only SQLite запросом только двух точных собственных имён. Настройки
stock Airbrush600/All/Basic/Snap и rotation free/1/0 восстановлены. Оставшийся
собственный cached процесс Krita после закрытия документа остановлен; Chrome
и пользовательские документы не изменялись. Lifecycle cleanupComplete=true.

После исправления native refresh-policy источник больше не делает выключенные в KPP spacing/timing queries: текущее число кадров 143, прежнее 185 относится к старому diagnostic packing. Исходные Android packets, KPP/provider и native RGBA SHA не изменены; число отпечатков и весь native рисунок перепроверены.
