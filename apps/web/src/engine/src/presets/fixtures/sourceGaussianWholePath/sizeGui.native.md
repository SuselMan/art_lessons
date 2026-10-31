# Реальный GUI штрих Basic5 SizeOpacity: переменный размер

Samsung SM-T970, Krita 5.3.4.1, оригинальный индекс7 `b) Basic-5 Size Opacity`.
Генератор Gaussian **40**, scale1, circle/fades1, AAtrue, исходный angle6.28319,
manual precision5 и spacing0.2 сохранены. Нет перебиндинга диаметра, подбора
геометрии или изменения runtime preset. KPP37879bytes, SHA256
`bd0610171db6d3eca006e7b12697d7baf3868ef34cbf3b1e792592d2f0957939`;
исходный установленный bundle совпадает с mapped stock fixture. Descriptor SHA
и eigen5.0.1 mapped ARM64 v3 provider записаны в JSON; исходные15 curves ранее
проверены оригинальным installed ARM oracle. Активная Size curve:
`0,0.0698697;0.196891,0.144105;0.689119,0.812227;1,1;`;
Opacity: `0,0;0.325305,0.288175;0.727782,0.924817;1,1;`. Flow constant1.

Свой прозрачный RGBA8 документ512×512/300dpi/zoom100/rotation0, None smoothing,
чёрный цвет/UI opacity100%. Независимый SVG того же процесса устанавливает
quarter origin −924.75/−659.75 до сравнения PNG; точность десятичной записи SVG
не выдается за полную double precision. Путь (973,756)→(1053,816), реальные122
Android events/source0x5002/device6/stylus2 за2056ms. JSON хранит исходные F32
биты x/y/pressure и фактические t. Pressure0/40/80/120 равны .25/.5/1/.25;
UP0 только завершает author, не планируется как новая точка давления0.

Mode/outerBlend получены из исходного PaintOpAction2 (wash/over). Fresh whitelist
подтвердил отсутствие useCreamyAlphaDarken/tabletPressureCurve в kritarc:
использованы pinned defaults creamy=true и линейные1025F32 samples для Samsung.
Полный settings файл оставался только в RAM; его SHA записан. UI100% определяет
resource opacity1. После штриха в том же процессе экспортированы **все169 params**:
каждый совпал с оригинальным KPP. В том числе оба флага
`PaintOpSettings/updateSpacingBetweenDabs=false`, `PaintOpSettings/isAirbrushing=false`.

Нативный helper выбирает отдельно spacing/timing refresh: flag?50:LONG_TIME;
`kis_timing_information.h:15` задаёт LONG_TIME=320000000000.0. Источник pinned
bd6e8d061d2f0388c5b10278786cf0fe62e3135f. Старый descriptor задавал50 всегда.
Это меняло9-й отпечаток: (61.8477463894,106.4483189986) вместо
(61.6724163888,106.3168255110). Исходный FAIL сохранён отдельно:195frames,
1352 отличающихся alpha/max128, SHA9c29af6365a409315f0cd58734482cda0b02e00bebb59f007a78edc7f3b179b8.
До исправления новый тест падал именно на этом полном RGBA SHA.

Диагностика изменила ТОЛЬКО два refresh intervals по фактическим false flags,
без правки pressure/curve/mask/composition:26draws/149frames и точное совпадение
всех1,048,576 RGBA bytes с nativeGUI, SHA
`8a32b92a38f360c3d3862ddaa6779298b7cd3902bce582bf4e43e4e5f262e5c4`.
Видимых2691pixels, частичных1530, различных alpha229. Отдельный original ARM
whole-mask oracle под Unicorn подтвердил все26 исходных (до исправления spacing)
запросов побайтно; отдельная оригинальная Size transfer256 совпала на всех26
исходных pressure. Это исключения для тех запросов, не наблюдение GUI request queue.

Регрессия использует **обычный** sourceStrokeAuthorDescriptor с explicit native
input profile, без override интервалов. SAME author→adapter→encoder и существующие
GaussianDab/fused32 CPU numerical kernels проверяют полный nativeRGBA SHA.
Structured-clone/resume после каждого yield сохраняет steps/RNG/frames/draws.
Исторический undefined input profile не переименовывается; fixture не даёт нового
room/editor/GPU admission, не покрывает все кисти, native precision cache-copy
или другие варианты глобальных настроек.

Своё GUI действие изолировано: исходный background JobInfoSchedulerService PID10669
подтверждён read-only audit; intervening user ActivitySTART отсутствовал. Failed
initial-process precheck/shell fallthrough сохранены в receipt; до аудита документ
и ввод не создавались, второго amstart не было. После capture свой документ/пресет
закрыты/удалены, remote KRA/KPP/helper и registered disposable удалены, stock
Airbrush600/All/Basic/Snap и rotation free/1/0 восстановлены. Изначальная фоновая
служба сохранена без forcekill; пользовательские документы и Chrome tabs не тронуты.

Компактные ignored R52 receipts: native-gui-stroke52/size60-whole-native-proof.json
(исходный FAIL), size60-source-refresh-proof.json (точное source-law diagnostic),
size60-mask-comparison.json, size60-scale-table-comparison.json,
size60-runtime-diff.json и size60-lifecycle.json (`cleanupComplete=true`).
