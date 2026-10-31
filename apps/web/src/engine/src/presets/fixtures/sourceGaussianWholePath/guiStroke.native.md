# Реальный GUI Gaussian со связанными Opacity и Flow

Samsung SM-T970, Krita 5.3.4.1, исходная `b) Basic-4 Flow Opacity`, индекс 6.
Генератор **40**, scale1, gaussian circle/fade0.9/antialias=false; размер кисти
не перебинжен и не подобран по изображению. KPP 38626 bytes,
SHA256 `841a810de1ecb0a4700f0406068692beda6e4356049345043c5c70c232956703`
совпадает с установленным официальным bundle и mapped stock fixture.
Descriptor SHA и все три идентификатора mapped provider сохранены в JSON.

Активны две настоящие pressure curves: Opacity
`0,0;0.507538,0.336683;1,1;` и Flow `0,0;0.595855,0.323144;1,1;`.
Коэффициенты взяты из существующего eigen5.0.1 mapped ARM64 v3 provider,
ранее проверенного независимым оригинальным 15-curve oracle; старый отдельный
3.4 compiler сюда не подставлен. Size и Scatter выключены. Native spacing —
automatic coefficient0.4, manual precision5. Фактическое число отпечатков
вычисляет существующая source geometry/spacing; оно не задано числом из оценки.

Собственный прозрачный RGBA8 документ 512×512, 300dpi, zoom100%, rotation0,
сглаживание None, чёрный цвет, opacity100%. Независимая полилиния того же
процесса подтверждает quarter origin −924.75/−659.75 с ограничением десятичной
сериализации SVG. Физический путь (973,756)→(1053,816), 122 фактических Android
события source0x5002/device6/stylus2 за 2039ms. Сырые F32 биты pressure на
индексах 0/40/80/120: `.25/.5/1/.25`; UP0 не является новой author точкой.

Mode/outerBlend выведены из source PaintOpAction; creamy и глобальная линейная
кривая давления — из свежего whitelisted отсутствия соответствующих ключей
в установленном kritarc и pinned reader defaults для Samsung. UI100% записан
до штриха. Полные настройки оставались только в RAM. Экспорт текущей кисти после
штриха в том же процессе совпал со **всеми 169 stock params**.

SAME native-profile SourceStrokeAuthor → MaterialAdapter → CanonicalFrameEncoder
создают 36 отпечатков и 183 кадра. Затем существующие GaussianDab NEON и fused32
creamy CPU kernels дают SHA полного native GUI PNG:
`916578fc7da45da333e8507dfddb2b1f0e4d1086211792f8dc51f727584a3e7a`.
Различий всех 1 048 576 RGBA bytes — **0**, maxDelta0. 5041 видимый пиксель
имеет частичную alpha, различных alpha249. Первый Flow
`0.06752904504537582`, последний `0.0710003599524498`; Opacity и средняя
непрозрачность также меняются. Это проверка реального nonunit Flow, а не только
непрозрачного stamp. Structured-clone/resume после каждого yield сохраняет те
же steps/RNG/frames/draws. Девять исходных модулей проверены по SHA до и после
измерения, включая frozen rotation helper; фактическая rotation здесь равна0.

Это одна реальная кисть и CPU доказательство рисунка, без нового editor/room/GPU
admission. Ресурсы убраны: свой документ закрыт, KRA/KPP удалены после сравнения
байтов, диагностический preset удалён через GUI, helper/registered build удалены.
Stock Airbrush600/All/Basic/Snap и rotation free/1/0 восстановлены; native PID
отсутствует, пользовательские документы и Chrome tabs сохранены. Полные компактные
receipts: R52 `native-gui-stroke52/gaussian59-whole-native-proof.json`,
`gaussian59-lifecycle.json` (`cleanupComplete=true`), `source-author-receipt-gaussian59.json`.
