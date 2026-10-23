# После better67: H-proxy не готов к production

Human better67 подтверждает конкретный CPU fixture normal-finish результат текущего листа4. Модель использует реконструированную геометрию old/new recorded ellipse poses, initial-volume-matched smooth product, независимую H=1+addon и 120 больших hop6..11. Она не знает реального объёма воды и не воспроизводит live delivery. Сборка H после stroke получает будущие точки. Перенести CPU arrays или special room IDs в production нельзя.

## Отдельная техническая задача

1. Определить физический смысл H: доставленная кистью свободная вода отдельно от P.A носителя и coverage occupancy. Дозу и высыхание нужно определить до кода; geometric-volume matching не является законом подачи воды. Старые wet-only washIds должны участвовать через документированный remobilization, а не непроверенный MAX records.
2. Сформулировать finite-volume пару: water transfer по height difference и отдельное symmetric all8 P/C allocation. Общий color/physical recipient capacity сейчас блокирует воду; это свойство fixture, а не доказанная физика. Решить, движется ли вода при полном pigment/color receptor. Не менять silently этот закон при port.
3. WebGL1 H RG16 encoded0..4, NEAREST, integer-code delta subtraction/addition sharedpair. Два canonical1536 RGBA8 targets потребуют18MiB extra memory (512 targets2MiB). Проверить ceiling и bufferpool/mobile holding. Float extension нельзя считать доступным наSamsung/iPad.
4. CPU avalanche hash uint32 не доступен буквально в WebGL1 GLSL ES1.0. Выбрать точно вычислимый pair/tick phase с численными границами, independent of slice/replay/frame. Existing mod251 подходит как воспроизводимый baseline, но ранее визуальный diagonal dither требует отдельной проверки. Не объявлять равенство старому CPU hash.
5. Контракт операций прежний только если состояние H детерминированно восстановимо из текущих операций и полных recorded water semantics. Replay/undo/checkpoint должны захватывать H или воспроизводить его из log; live chunk boundaries не должны влиять на source/depletion/pressure clock. Определить lifetime wet groups и чужую чистую воду.
6. GPU работа — генератор bounded work units: каждая paired H/P/C sweep атомарна относительно pre-state, color сначала, material затем, H перед/после строго определённо. Между единицами existing slice scheduler. Не выполнять 120 sweeps в одном synchronous draw loop и не копить гигантские closure arrays. Первый единичный sweep verify readPixels separateFBO ≤1s; реальный GPU budget не выводить из JS timer.

## Проверки перед production

Closed original domain controls: all8 sums EXACT integer, Hcode sum EXACT, bounds0..255/65535, PB=CA equalinput preserved, sourceamount clipping counted, no invisible mass beyond coverage.A, no sumrepair. Zero-pressure field identity; uniform H/P/C stationary. Global source water input/output accounting with evaporation separated.

Actual fixtures3/4/6/7/9 plus fresh strokes: purewater then pigment separatewash/samewash, crossing latewet/dry, densezigzag, perpressure tail. Live vs replay vs undo vs restore parity, cross-device salted realGPUcompile Samsung plus iPad/Surface. Texture memory peak/fullA2/rebuild and heavy stroke background input queues.

Architecture discussion required for genuine H lifetime/physical source law before implementation; current67 evidence justifies that next issue, not a special production fixture. Existing 679 simulator stays stopped.
