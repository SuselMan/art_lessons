# #680: изолированная концентрационная диффузия

Default-off `setWatercolorAb({noSpread:false,noMigrate:false,concentrationDiffuse:true})`, от0c517b10. Не содержит отвергнутый solventFlux. Existing carry, source dose и water-front schedule одинаковы OFF/ON; меняется только fine diffusion (radius≤4fieldtexels, knightmax8). Coarse mixing остаётся baseline до отдельного решения о стоимости.

Вода статична: V=4*solvent.a, pigment=2*P.b. Движущая разность концентраций `2P.b/V`, gate=mincoverage/(1+8maxconcentration²). Пара переносит все4P в пропорциях донора, выделяет1/8receivercapacity иdonorcontent каждойграни. Whole-byte transfer одинаково вычитается/добавляется. Singlepaint firstnonnullpigment и known puritymetadata; physicalserial считаетbeginStroke, неchunks. Snapshot unknownreject. PairedC/multicolour/secondpigment исключены; singleTau colour позже восстанавливается изP, это не8channelCmassproof.

Standalone lazy shader, без ростаAdrenobookkeeping; дополнительных buffers нет. Supercover pathfloor+ceil симметричен приreverse, закрываетdrygap. Максимум7intermediatepoints наface (две проверкикаждый);8faces. Большой1536field не запускать до128/256timedprobe. Retire/destroy/contextrestore учитываютlazyprogram.

ON — pure Fick diffusion: gravitybias=0, это явный дополнительный контроль, не обещаниеpixelno-op противbaselinegravity. CPU P=cV stationary, constantV scalar difference, drygap0, allRGBApairmass/positivity/headroom/reverse проверены. Existing scalaroracle фактическихV/P/coverage описан в соседнем680-solvent-flux c22047cc; концентрация сама по себе не обещаетпальцы или исправлениеспирали. СледующийGPU сначалаsmallprogramproperties+timing, затемsmallvisualAB/direct/drydry поочереди.
