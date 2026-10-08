# Native source+live: Surface, 100px

Аппаратный AB диагностического флага `diagnosticSourceLiveSubmission` (479948eb): native author/replay hashes, tape/paper hashes и полный `stageComparison` совпали OFF/ON; GPU errors пусты. Все прежние draw/pass/Q8 границы сохранены; изменён только общий encoder/scope двух последовательных фаз.

Author wall time 1263→972ms, packed replay 1119→1184ms. Разный знак изменения и последовательный порядок не позволяют утверждать ускорение. Время включает диагностические readback и не является чистым GPU временем либо pen-to-pixel latency. Артефакт: `temp/fast-watercolor-night/native-source-live-surface-1791426531964.json`.

Следующий gate: шесть чередующихся OFF/ON свежих owners, 100px, без промежуточных readback/stages; итоговые hashes после завершения и счётчик только adapter submissions до финального readback. Сравнивать распределение времени до readback отдельно от старого общего времени. 400px solvent нестабилен отдельно; этот результат его не закрывает. Флаг остаётся OFF.

## Повтор AB6: выигрыш по времени не подтверждён

Шесть запусков 100px без промежуточных stage readback, порядок OFF/ON/ON/OFF/OFF/ON. Wall time до финального readback (author / packed replay, ms): OFF 1254.5/991.5; ON 988.1/940.0; ON 968.1/942.3; OFF 987.2/929.6; OFF 957.1/944.6; ON 956.9/951.9. Все итоговые hashes совпали. Первый холодный OFF нельзя использовать как подтверждение ускорения: прогретые OFF/ON перекрываются, устойчивого выигрыша не видно. Эти durations включают drain/queue completion и CPU scheduling; не чистый GPU time и не физическая задержка пера.

Дополнительный парный запуск подтвердил счётчик: OFF 721 → ON 648 успешно submitted adapter quanta в обоих author/replay; ровно 73 submit удалены, финальные hashes одинаковы, errors пусты. Сокращение submit не обеспечило подтверждённое сокращение времени. Кандидат оставляем OFF; аппаратный speedup не заявляем. Новую цепочку экспериментов по нему не начинаем.

Артефакты: `temp/fast-watercolor-night/native-source-live-ab-surface-1791426736125.json`; supplemental counter run с суффиксом `1791426820655` (точное имя файла определяется журналом root).
