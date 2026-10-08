# OFF preview front/carry: доступный seam

Actual immutable owner имеет original, pigmentLoad/Base, colourLoad/Base,
solventLoad/Base, coverage. V.R/A — water support, не глубина. Full coverage.B
содержит standing-water material; support128=(0,0,0,support) его не заменяет.
Pressure/cost, effectiveWet/standing, budgetPx/costMax и merged predecessor base
в retained owner не захвачены. Поэтому нельзя объявить восстановленное поле
production pressure без дополнительного SOURCE scalar capture.

`PreviewFrontCarryGlPort.mjs` — исполняемый независимый GL primitive, ещё НЕ
Room-wired. Он требует явные frozen параметры, seed mode10 читает actual full
readonly coverage.B, unit waterFrontStep пишет два собственных Q8 pressure
128 поля. MaxFrontSteps явно1..32; один вызов=одна relaxation, не250-steps loop.
Carry16 сначала C с c=OLDP, затем15 P, fixedP общий; targets distinct. Страйд
только1: nearest axis не телепортируется через сухой texel. Plateau e читает
readonly actualV; маска домена и pressure должны сохранять сухой разделитель.

Это visual-only cost domain. Unit-stride с ограниченными32 relaxation может
не достичь полного production frontier; budget не увеличивается незаметно.
После carry mobile пара должна swap один раз, затем .45core/.2slices finite
clock; исходные/canonical8 никогда не меняются. Новый pressure ledger2Q8
128/owner=.125MiB, на3=.375MiB, totalpreview18.75MiB; пока ещё не аллоцирован.

CPU binder test доказывает порядок, OLD density, coverage источник и остановку
budget ДОGPUcall. Topology negative проверяет отдельные лужи. Это НЕGPUmass
proof. Требуются isolated actual shader P/C source+output sums, outside-support
nonzero0, plateau nonnegative, water-gap negative и source8SHA before/after.

Следующий конкретный capture seam: immutable source-options при seal должны
содержать water, radius/worldScale, effectiveWet/standing или явно помеченные
SOURCE-only их оценки, costbudget и production carry constants. Нельзя брать
in-progress parent scratch pressure; late predecessor land меняет canonical
context. Finalcanonical SAME NEWtape должен остаться прежним.
