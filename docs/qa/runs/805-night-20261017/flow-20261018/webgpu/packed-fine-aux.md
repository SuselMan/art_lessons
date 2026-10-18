# Точная упаковка служебного fine-буфера

Macro24 меняет только представление fine aux: capacity16 + affinity9 + wet1 укладываются в один u32 вместо vec4u. Пределы прежние: capacity≤65535, affinity1..256, wet0/1; запасные биты нули. Pair получает те же x/y/z после декодирования. Init использует те же значения; coarse, M/D, paper, PACK, dispatches и параметры неизменны.

Декларируемые GPU-буферы меньше ровно на12,582,912байт при1024². Это сумма размеров собственных буферов, не измерение RSS/VRAM процесса. Старый путь остаётся default; compactAux opt-in в отдельном prototype-ID. Изменение затрагивает прототип, не Grafetto.

CPU:100000 произвольных aux/pair-состояний, максимальные значения, all4channels exact; fullfactory mock проверяет shaders, uploads, dispatches и единственное уменьшение буфера. Source drift закрывает выполнение с ошибкой. TypeScript strict/noUnused и oxlint проходят.

Samsung V22: первые четыре matched pairs дали полное RGBA, coarse, fine4ledger и stream field совпадение, в том числе мягкую affinity128/gain1. Ускорение пока не заявляется: ABBA ещё выполняется. Детерминизм на Intel для этого ID ещё не проверен.
