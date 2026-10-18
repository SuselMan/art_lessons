# Macro28: ограниченная реконструкция концентрации на грани

Мотивация: последовательный first-order upwind перенос сам размывает материал, даже если сократить симметричный exchange. Проверяем Q8-концентрацию Mα/W и minmod-реконструкцию её значения на грани с коэффициентом (1−q/W)/2. Water, pressure, streamfield, adsorption и donor-color пропорции прежние; alpha packet после коррекции ограничен наличием donor и free capacity recipient. Все4канала одного packet вычитаются/прибавляются целиком.

Это вдохновлённый MUSCL подход, **не доказанная TVD-схема всего нашего coupled split solver**. Upstream src берётся из предыдущей split-фазы, тогда как текущая пара уже могла пройти exchange. Если upstream/receiver без поверхностной воды или upstream за листом — прежний flux. Дополнительные чтение соседа и деления могут замедлить GPU; ускорение не заявляется.

Источник идеи: [учебная реализация R.J.LeVeque, AMath574, high-resolution advection](https://faculty.washington.edu/rjl/classes/am574w2023/_static/advection_highres.html), minmod и CFL-зависимая коррекция потока. Наш concentration packet не является прямой копией полной схемы Clawpack.

Безопасность u32: |slope|≤floor(256M/W), factor≤256(W−q)/W. Поэтому q·|slope|·factor≤65535·65536·CFL(1−CFL)≤1,073,725,440<2³⁰. Сдвиги/концентрация помещаются в i32; исходный q≤4W/5. Кругление flux может дать отклонение экстремума на один u16code — это реально наблюдалось в CPU-примере, строгая nonoscillation не заявляется.

CPU:200000 произвольных ограниченных packets, все4суммы, capacity/premultiplied, disabled exactold, u32bound. Actualfactory test требует, чтобы pipeline содержал именно limited coherent source, а не только загруженное поле. Иллюстративный simultaneous1D uniform-water hat после128шагов/CFL.25: L1ошибка155908→76156, пик20000→20001. Это не GPU-измерение и не результат paired-water модели. Всего4CPU PASS, strict/noUnused tsc и oxlint0. Следом обязательные настоящие GPU-картинки/масса/смешение/время.
