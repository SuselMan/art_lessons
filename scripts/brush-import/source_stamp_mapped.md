# Explicit mapped source binding

`source_stamp_mapped.compile_mapped_source_stamp(data, provider)` uses the trusted
`MappedCurveProvider` API and the existing raw source reader. It emits a distinct
version2/profile/buildId dictionary. Shared validation checks its shape; portable
import regenerates it through the explicitly configured trusted provider. It never relabels old3.4 output.

Inputs are independently copied and reconstructed from raw settings before
compiler work. Required sensor curves retain their stable ordering and identity
bypass. A soft radial curve is compiled separately even if mathematically identity:
its original-resolution table is not an identity sensor. The existing aggregate
byte convention and compiler batch/knot quota are checked before launching a child.

`verify_mapped_source_stamp(data, compiled, provider)` validates closed fields,
raw curve bindings, lengths, finite values and trusted profile/build before
regeneration through the SAME provider. Coefficients must match binary64 bits,
including signed zero; no epsilon or persisted-data claim supplies authority.
This is an offline producer/verifier, not a new spline implementation. JSON
export/persistence must preserve signed zero or be rejected on re-verification;
no current editor persistence guarantee is asserted here.

Tests cover disabled sensors, radial identity, input mutation, unknown fields,
wrong build/profile, raw-point and coefficient tampering, nonfinite/huge numbers,
signed zero and budget denial before child execution. Explicit native-provider
integration compiles/re-verifies all10 original retained soft roles and compares
their radial coefficients bit-for-bit with the five independently captured
original constructors. Other sensor results are source-bound and reproducible;
this test does not independently prove each sensor against original ARM output.

Receipts: fixes-v52/mapped-source-binding-{tests,native-tests,full-python}.log.
The native provider executable is an explicitly supplied temporary test resource,
not committed or inferred from a brush/environment by production import code.
The author adapter selects explicit fused sensor arithmetic for the mapped
dictionary and preserves separate arithmetic for legacy dictionaries/callbacks.
Soft author/material integration and actual-device/UI verification remain gates.

CLI selection: --mapped-curve-compiler ABSOLUTE_PATH --mapped-curve-build-id HEX64.
Both flags are required together and are mutually exclusive with the old
--native-curve-compiler. Programmatic KPP/bundle import and portable_bundle accept
mapped_curve_provider=MappedCurveProvider(path, build_id). Neither KPP settings
nor environment variables select a production executable. Compilation failures
retain explicit unsupported compiler notes; no fallback to the old provider.
The default conversion mode remains unchanged until this configuration is chosen.
