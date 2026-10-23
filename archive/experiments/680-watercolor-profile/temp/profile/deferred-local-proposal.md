# Deferred local watercolor: предложение, не реализовано

Принцип: Operation Log и слои остаются каноническими, preview — временный визуальный feedback. Предыдущий solver получает тот же набор passes в том же порядке и завершает copy-back до нового канонического paint. Никакого второго diffuse field.

Шов: ветка перед index.ts:5491 при локальном watercolor и существующем settle. DeferredLocalGesture владеет CPU samples/dabs, latched brush/camera/layer/stroke/wash identity, временным stamp-only viewport AccumulationBuffer. Полный op и log откладываются existing FIFO; eventual _paintOpOverFrames исполняет канонический payload. Preview удаляется только после canonical paint или abort.

Нельзя использовать _paintDabs(watercolor) в preview: этот путь создаёт ribbon scratch и использует физический solver. Reuse только AccumulationBuffer composite и CPU factory. Existing forkForPreview требует audit latched settings: nibScallop сейчас не копируется, поэтому его нельзя объявить exact chisel clone.

Первый CPU oracle: direct generator против capture factory — packed bytes/wet/chunk IDs для round/chisel, pressure jitter, coalesced input и 800+dab chunk. Тот же input timestamp; source options/camera frozen. end taper/pooling/lift обязательны. Сравнение всех canonical PNG — после approval prototype.

Основная сложность: _paintStrokeDabs сегодня объединяет wet sampling, dab baking, GPU ribbon, standing/drain/deposit PaperWetness и live serialization. Wet должен фиксироваться в input-time, а не в момент deferred replay. Один deferred gesture допускает existing underlying wet reading; несколько жестов до commit требуют CPU standing-water clock + shadow pending wet. PaperWetness сейчас не предоставляет clone/snapshot API. Без этого быстрый второй gesture записывает неправильную воду.

Границы bounded prototype: один deferred gesture, old solver autonomous, отдельный safe preview, explicit guard на следующий gesture/структурное действие. Нельзя потерять/выкинуть новое input. Production continuous path требует FIFO и CPU wet shadow; synchronous fallback для второго gesture сохраняет корректность, но ограничивает выигрыш. Root выбирает scope до source edits.

Memory: один Samsung viewport RGBA1670×2395≈16MB; 800 packed dabs≈42KB плюс JS. Второй A4 solver запрещён. Остальной scratch pool остаётся прежним.

Undo/layer clear/reject/contextloss отменяют preview+непринятый deferred gesture; accepted op остаётся в log. Export/checkpoint/snapshot не включают preview, обязаны дождаться canonical queue async. Peer/local FIFO не обгоняет друг друга. Server seq назначается штатно через onLocalOperation; не выдавать pending preview за уже применённую операцию. Все flags opt-in до hardware/history parity.
