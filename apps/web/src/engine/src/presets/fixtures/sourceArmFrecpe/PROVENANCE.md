# ARM AArch64 FRECPE FPCR0 value primitive

Actual Samsung instruction receipt:155636 input/result pairs, exact rawu32
agreement with authored `arm64ReciprocalEstimateF32Bits`, no tolerance. Retained
977 compact records use fixed input strata, including special bits. The full
capture SHA is cdfe52191e0e104297f13337adedc6fbab742149004ec1f18e30ad77047a2862.
Receipt FPCR0,FPSRbefore0,FPSRafter0x1f. This is a standalone instruction
receipt, **not** evidence of Krita factory, alignment, packet or color-space
selection. There is no production consumer/admission in this commit.

Official source DDI0596, Arm shared `FPRecipEstimate`/`RecipEstimate`, version
2025-03_rel, pages5896–5898:
https://documentation-service.arm.com/static/67e40f3398aa3c3b6eea6a85
Full document SHA/bytes are in source-lock.json. The authored implementation
encodes the mathematical nine-bit estimate using integer division and packs
its binary32 sign/exponent/fraction. It does not copy pseudocode text. It
handles both non-overflowing subnormal exponent bins, signed zero, infinity,
and NaN payload quieting. FPCR0 fixes nearest-even, no flush-to-zero, no default
NaN, no alternative/increased-precision mode. Exception status/traps are
outside the pure value API; the receipt separately stores actual FPSR.

`receipt.s` is our freestanding AArch64 assembly. No NDK/SDK/libc or Krita
library. Linux write/exit syscall numbers and official ABI source locks are
in capture-proof.json. It does not write FPCR/FPSR and has no app/UI interaction.
`generate-inputs.py` independently generates all input bit patterns, not an
output lookup table: every nonzero alpha16 integer and normalized alpha16,
16384 raw-F32 xorshift bits, bounded composite denominators, and edge inputs.
Native output also stores FRECPS and one refinement for future work; this
primitive deliberately returns the unrefined FRECPE result only.

Reproduce in a disposable directory: generate-inputs.py; assemble receipt.s
with GNU aarch64-as; link static with aarch64-ld.bfd -e _start -z noexecstack.
Root ran that helper on actual Samsung with existing ADB and removed the
remote helper in finally; no app settings were changed. Validate raw stdout
with validate.py; input count, exact ordering, length, checksums and SHA are
checked. Package extraction was official pinned Ubuntu binutils only and
was removed after the build. No compiler/runtime dependencies are added.

Float numeric wrapper is convenient for finite operands; JS Numbers do not
promise signaling NaN payload preservation, so rawbits are authoritative.
This is a new source-defined profile; legacy scalar/portable-float kernels
and SIMD packet dispatch are unchanged.
