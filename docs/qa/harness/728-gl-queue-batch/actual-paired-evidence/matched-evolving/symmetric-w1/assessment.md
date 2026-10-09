# Симметричный CPU prototype с постоянной capacity w=1

Эксперимент visual-only; canonical не менялся, аппаратной проверки нет. SAME actual matched capture, общий поток для восьми моментов, 12 macrosteps × 64 unit substeps. Единственный заранее выбранный conductance: минимум встречных homogeneous fractions; исходный g=0.023421498890197356. w=1 — математическая effective capacity, не объём воды.

Evolving: M2=191.9613667, h4=0.00302450, peak=0.40227423 против source peak=0.43529412. Масса: max absolute error 9.38e-12; hue/dry errors=0; source неизменён, outward fallback не потребовался. Peak не растёт на macrosteps; симметрия и CFL обеспечивают maximum principle для постоянной capacity.

Визуально просмотрено evolving-12.png: компактное округлое мягкое пятно без квадратных spikes прежнего directed driver. По сравнению с radial control заметно меньше движение (radial M2=220.5418854); новое решение ближе к homogeneous control (M2=192.1436725). Это причинное подтверждение, что симметричное локальное перемещение устраняет усиление пиков, но пока не убедительный живой морфинг и не готовая акварель. Переходы PNG не являются полным renderer Grafetto: optical approximation, без бумаги/coverage/reveal. Не переносить на GPU как утверждённую модель.
