# Actual four-prefix ΔMAX, calibrated41 CPU: interpretation before GPU

Dataset: ONE translated original9/3 prefix47dabs,4sourcegroups15recordedCF. Fixed rawROI129x96, bottom-up; rawcaptured at R8ZERO. Allrawchannelprefixesmonotone; P.B=P.A=C.A eachprefix. ΣΔ exactlyfinalrawchannelcodes. No approximation of source deposition.

Calibrated clock global20%radius-exposure impulse, general8channel integeredge allocation. All transport microsteps preserve every channel sum exactly in CPU; pairedalpha and physicalB/A remain identical. Trueincrement addition can exceed255 after movement: carrier82codes clipped (.00971% of844090), Ptotal167/Ctotal149clipped codes across channels. Finalsourcefirst has no incremental additions/clipping. Wholeprefixrefill increases carrier to860304, +16214(+1.921%) versus rawfinal; it is a deliberately different repeatedwholeprefixlaw, not exactR7unknownnewsubmaxstamps.

Trueincrement vs finalsourcefirst physicalRGBA MAE.3834code, max47,3127cellsdifferent. Trueincrement vs wholeprefixrefill MAE2.0715,max90,4971cellsdifferent. This prefix demonstrates small measured chronology effect and larger source-reimplant confound, not a solution for full9 clouds. Endsource unchanged total rawinventory; optical readout/front/finalsettle omitted. Strong finalfullstroke photograph conclusion is unsupported.

GPU pending uses exactlycalibrated41 fragment and identical capturedCF, but CF tightR8 fields are not41pad4 builder output. Goal is float32/readout/rounding confirmation, not fullengineequivalence. CPUdouble floor ties/nearest midpoint/wholeROI vsscissor can differ; compare perchannel sums/depositionclipping and alpha residual rather than claiming equivalence from similar image.

Hash manifest calibration-law-hashi.json freezes exact CPU source, capture, transformedGPUshader and candidate law. NoGPUrun by this agent, no source/productionchanges.
