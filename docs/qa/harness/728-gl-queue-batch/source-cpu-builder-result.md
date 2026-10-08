# Builder-only и ресурсная идентичность

Дополнение к отрицательному aggregate `4bcb33cf`, его результат не отменяется. Collector теперь различает наборы ролей actual scratch buffers и encounter alias IDs: одинаковые размеры больше не маскируют перестановку или объединение ресурсов. OFF/ON по-прежнему имеют одинаковые 188 команд, Float32-биты и материалы.

Отдельный builder-only benchmark воспроизводит именно восемь захваченных вызовов production source, с исходными callback и аргументами. Пять прогревов, двенадцать alternating пар, восемь повторений каждой arm: OFF median 33.495 мс, ON 26.880 мс; paired median ratio .8024, ON быстрее 10/12. Это около 20% локальной CPU геометрии в Node, без resource owner, command collector, GL, rAF и истории. Whole gain неизвестен. Instrumented collector сохраняет nested stage attribution отдельно. Encoded output bytes одинаковы.

`prepareDelivery` нельзя просто объединить: каждый из восьми сегментов использует предыдущую точку и последовательно обновляет scratch dose/depletion/travel. Уменьшение количества вызовов без сохранения восьми state transitions изменило бы материал. Готового proof-safe сокращения этого участка не найдено.

Тест PASS 1/1, исходный и profiled source OFF/ON проверены. Аппаратная проверка полей/истории ещё не выполнена. Production и review 5352 неизменны.
