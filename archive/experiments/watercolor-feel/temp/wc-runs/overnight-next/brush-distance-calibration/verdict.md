Current flow B=1-exp(-length/R*water*(1-r²)); RG divides accumulated weight and therefore already records conditional mean direction. Substep count is round(.25R/S), not ceil(recorded contact length/texel): changing hop to unit substeps preserves old displacement scale, not a kinematic brush-distance calibration.

Centre contact with length=.5R, water1 has B=.3935. Expected old advective displacement=.25R*.6*.3935=.059R=.118length; removing B only from advection gives .15R=.30length. This is a constitutive coupling choice, not proof of an erroneous second attenuation: a porous brush may move a fraction of its own travel. Need human/GPU evidence before choosing target.

A causal occupancy diagnostic can split exchange:
adv=.6*max(dot(velocity,dir),0)*step(1/255,min(flowFrom.b,flowTo.b))*paperContact;
mix=.02*concentrationGradient*min(flowFrom.b,flowTo.b)*paperContact.
RG mean confidence stays unchanged; BOTH endpoint support remains, no external-mask removal. Total outgoing <=.6sqrt2+4*.02=.92853; matched paired coefficient/capacity remains. Own water retained only in mixing and contact-support threshold: nearly dry residual .04 still permits strong mechanical advection, so this diagnostic separates mechanical movement from liquid-dose mixing.

Risk: binary occupancy removes smooth grazing-contact variation and byte threshold can alter tiny contacts. Alternative smooth occupancy is a parameter family, not a recovered geometric footprint. No production change, GPU run or runnable spec here until root chooses bounded-law diagnostic. Actual CPU table gives raster quantization and spatial means, not a falsely exact global displacement proof.
