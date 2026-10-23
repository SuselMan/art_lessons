# Следующий захват independent solvent для spiral/blob

База c3b128ec. Existing first/ содержит straight, не spiral/blob; policy/gpu не raw. GPU очередь принадлежит puddle_outline.

Для каждого кейса нужны raw RGBA8 bottomup и metadata:
- Before current gesture: solventBase (или retained previous V), P/C base, origin tile + dimensions.
- Before finish current gesture: solventLoad, solventBase, strokeSolvent, inkLoad, inkColor, coverage. V=4*alpha/255.
- Canonical pre-front: independent V sampled at SAME field grid as P/C; retained solventBase if distinct; P all4/depth C all4; coverage/domain; origin+S.
- Existing compactblob / spiral paired oldbaseline cases may preserve distinct dose; don't call equal-dose comparison.
- After relevant carry stage P/C and V (V currently static, should byte equal if no solver).

Capture source versus canonical mapping explicitly; don't pair source1024 with canonical1536 arbitrarily. Retained base destroyed by releaseFilm after finish, so intercept before release. Stand/source changes only own mirror after assigned GPU slot.

CPU bounded operator can use immutable face-state pairs q=.2*((V-base)i-(V-base)j) on fully wet connected paths, CFL<=.45 Vdonor, P/C shared q/Vdonor. Prefer local stride prototype first, verify actual nonnegative head/source and actual Pstrength/V viscosity. Multiscale acceleration needs physical interpretation; it is not proven converged Darcy solve.
