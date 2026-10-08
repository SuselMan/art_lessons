# OFF Float32 + manual material packet

TypedPool3slots actual15.375MiB (4ownFloat32 P/C128 per slot, water/domainRGBA8, pendingRGBA8 1024). Imported audited allocator6b495c2f/typed06638131 +aliasbbff09c6 tests. Unsupportedcapability wholepoolQ8fallback remains labelled; float hardware gate requires actualrgba32f and successfulFloatreadback, fallback cannot count asFloatPASS. Contextloss failsclosed. Pool release onlyafterknownidle, program own notenginepool.

ExistingwcResample fourtap initialization and diffuseStep writeownFloatPCNEAREST. No canonical physics/order/source texture change. Fourtapalias remains unresolved. NormalizedFloat128probe initialize/16/64/final reads2MiB max, finite/nonnegative values+error guards, no source8reads. Instrumentation perturbsqueue; notpenlatency.

OwnoptinDABclone materialprogram reconstructs ALL20P+5C source sampler calls (includes1markerbranch unreachable because this program onlycomposites). Fourfetchgenericwrapper withsameclamped footprint, P/Cweightsidentical. This interpolates momentsbefore originalratio/tau/colour math, notRGBblur. Separateprogram/defaultnoextra compile. Exactoriginaluniformkeynames, samepositionattributeindex, originalnoisebinder/context. Shader/program failurescleanup handles; disposeafterruntimeidle/loss. Samplerhelperhighp explicit forfloatingpreview.

ActualshaderUTF8 original148148bytes SHA796b7288b6ff5d91ef699bbb3d37b9cf10194e597b684557e01264bd878581b9; manual148864 SHAcef3f055465662ddc07661dfef7b378a11543e035b6cffb06144173319ca79e9. +716bytes in optinclone, originalunchanged. LargecloneAdrenocompile NOTtested; Samsungnotallocated.

CPU runtime/manual/probe7PASS; typed/allocator/bilinear11PASS; actualinstaller7PASS. ActualGPUcompile happensbeforeinput atpreviewReady and mustpass beforepaint. MaterialCPUSubmitMs/max are encoding/waitCPU measures, notGPUtime; RAFcadence separatelyscenario. Scope QAmax3previewadmissions/session, noartistreadyclaim.
