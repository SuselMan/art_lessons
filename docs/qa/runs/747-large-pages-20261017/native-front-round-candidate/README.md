# External ROUND_R native-front QA control

Runtime509fb989 unchanged. No GPU run during preparation; no app/shader export edits. `QA_NATIVE_FRONT_ROUND_R=1` defaults OFF. Reuses the existing native highp helper as one generalized owned-program compiler; no double swap. `QA_NATIVE_FRONT_HIGHPSAMPLERS=1` can be combined deliberately; otherwise samplers are original.

Only the unique native fragment R expression `min(best,u_costMax)/u_costMax` (source whitespace retained in exact anchor) changes to `floor((value)*255.0+0.5)/255.0`. G height, B source, alpha and all other shader source remain byte-identical. No prefix build/jump changes. This is an explicit output quantization diagnostic, not a portable UNORM guarantee or product promotion. Actual attached original shaders must match baseline exports before compilation.

Metadata preserves original/patched SHA, vertex SHA, highpSamplers/roundR booleans, exact outputAnchorCount, sampler declaration and changed counts, uniform keys and restore/delete proof. Exactly one owned program is compiled for either or both variants. Legacy helper call without options retains old highp-only behavior and produces identical shader text; all flags OFF imports/compiles nothing extra.

6 CPU tests PASS: previous highp source/restore and failure contracts; exact single R-only replacement with original samplers; combined one-program construction; missing/duplicate anchor rejection before compilation. Node syntax/apply-check PASS. GPU requires parent GO. First original-sampler+round control should be separate from highp+round; DITHER control must be held explicitly equal in each comparison, not silently changed.
