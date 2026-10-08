# Native source+live: Surface, 100px

Аппаратный AB диагностического флага `diagnosticSourceLiveSubmission` (479948eb): native author/replay hashes, tape/paper hashes и полный `stageComparison` совпали OFF/ON; GPU errors пусты. Все прежние draw/pass/Q8 границы сохранены; изменён только общий encoder/scope двух последовательных фаз.

Author wall time 1263→972ms, packed replay 1119→1184ms. Разный знак изменения и последовательный порядок не позволяют утверждать ускорение. Время включает диагностические readback и не является чистым GPU временем либо pen-to-pixel latency. Артефакт: `temp/fast-watercolor-night/native-source-live-surface-1791426531964.json`.

Следующий gate: шесть чередующихся OFF/ON свежих owners, 100px, без промежуточных readback/stages; итоговые hashes после завершения и счётчик только adapter submissions до финального readback. Сравнивать распределение времени до readback отдельно от старого общего времени. 400px solvent нестабилен отдельно; этот результат его не закрывает. Флаг остаётся OFF.
