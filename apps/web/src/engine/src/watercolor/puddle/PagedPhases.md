# Глобальные фазы M70 над страничным материалом (#797)

Это подготовительные engine-модули; controller/runtime здесь не подключены.
Входы — неизменяемые `MaterialFieldSnapshot`, RGBA8, строго GL bottom-up.
`size` — размер **всего конечного листа**, не страницы CPU-хранилища.
Все GPU-вычисления идут в существующей RGBA8 арифметике WebGL1.
CPU извлекает байты nearest taps, без усреднения/сглаживания/физики в float.

## Contrast

`createPagedContrastPhase(gl, readParameters, size, factory?)`:

- `prepare({p,c,water}, volume)` строит глобальный `puddleLowDimensions(size)`
  grid. Atlas содержит 25 nearest taps цвета на расстояниях -48,-24,0,24,48
  пикселей от глобальных центров grid. GPU выполняет прежнюю взвешенную сумму,
  включая пропуск taps за границей листа. Затем прежняя split-арифметика
  вычисляет selection, а `retainedComponents` работает один раз для всего листа.
- Подготовка публикует новый state только после всех вычислений. Исключение
  освобождает новые буферы, сохраняя предыдущий подготовленный state.
- `selection` — глобальная low-resolution retained mask.
- `renderReference(rect,p,c,water,outP,outC)` принимает GPU-буферы размера rect.
  rect задаёт глобальное положение окна. Raw sampling использует local UV,
  background/regionKeep — global UV. Выходы нельзя alias-ить со входами.
- `destroy()` освобождает принадлежащие фазе ресурсы.

## Background

`createPagedBackgroundMix(gl,size,readParameters,portableNoise=true,factory?)`:

1. `capture({initialP,referenceP,coverage})` получает raw и reference до solver.
   Eligibility считается GPU по глобальным 3×3 taps @12px. Параметры strength
   и distortion фиксируются здесь. Новая capture инвалидирует solved state.
2. `prepareSolved({p,c})` после solver извлекает четыре nearest taps ±0.5px
   у глобального grid, затем GPU выполняет прежнюю сумму в прежнем порядке.
   Сглаживания [2,4,8,4] работают над одним глобальным grid с LINEAR sampling.
3. `reconstruct(rect,p,c,coverage,outP,outC)` использует global UV для low
   fields и noise/flow; raw source и coverage переводятся в local UV окна.
   rect описывает **полное окно с halo**, а вызывающий код публикует только
   внутреннюю область. Halo должен быть не меньше `reconstructionHalo`:
   `ceil(32.4*abs(capturedDistortion))+1`. Это ограничение относится к
   shifted coverage lookup, а не к low-resolution полям. На глобальных
   границах raw halo собирается с CLAMP_TO_EDGE. Выходы отдельны от входов.
4. `readback()` возвращает global coarse gate, before/after P/C для диагностики.

Обе подготовки синхронны и атомарно меняют принадлежащий им state. Отмена
целого solver job и атомарная публикация его полей — ответственность вызывающего
фазового менеджера; результаты этих API не пишут обратно в CPU snapshots.

## Память и проверка

Максимальная сторона contrast atlas — 1280, eligibility atlas — 768,
четырёхточечного atlas — 512, глобальных coarse fields — 256. Ни одна из этих
фаз не выделяет полноразмерную GPU-текстуру A2. CPU gather читает пакетами
по одной строке CPU-страницы; float field размером с лист отсутствует.
Factory `(width,height,filter) => AccumulationBuffer` позволяет подключить
внешний бюджет/кеш; возвращённый объект обязан соблюдать filter и освобождаться
через `destroy()` (при внешнем lease это должен быть hook возврата lease).

Unit tests подтверждают раскладку taps, global clamp, ограниченные размеры
выделений, контракты lifecycle и отсутствие утечек при ошибках. MockGL/fake
buffers не исполняют эти shaders и не доказывают совпадение пикселей.
Нужны native GPU сравнения старого цельного пути и нового пути на одинаковых
raw fixtures: coarse background/selection/keep, references, eligibility,
четырёхточечное уменьшение, каждый smooth pass, реконструкция внутренних
областей окон; отдельно швы, крайние неполные страницы и обе ориентации A4/A3/A2.
