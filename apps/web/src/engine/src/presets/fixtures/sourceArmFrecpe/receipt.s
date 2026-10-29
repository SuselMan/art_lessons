// Authored standalone AArch64 receipt; requires Linux EL0 AdvSIMD/FP.
// No libc/interpreter; FPCR/FPSR mode is NEVER written.
// Linux asm-generic UAPI syscall write64/exit93.
.include "inputs-count.inc"
.arch armv8-a+simd
.global _start
.section .text
_start:
 adrp x19, output
 add x19, x19, :lo12:output
 adrp x20, inputs
 add x20, x20, :lo12:inputs
 adrp x0, magic
 add x0, x0, :lo12:magic
 ldr x1, [x0]
 str x1, [x19]
 mov w1, #1
 str w1, [x19,#8]
 movz w21, #(INPUT_COUNT & 65535)
 movk w21, #((INPUT_COUNT >> 16) & 65535), lsl #16
 str w21, [x19,#12]
 mrs x1, fpcr
 str x1, [x19,#16]
 mrs x1, fpsr
 str x1, [x19,#24]
 add x22, x19, #64
 lsr w23, w21, #2
1:
 ld1 {v0.4s}, [x20], #16
 frecpe v1.4s, v0.4s
 frecps v2.4s, v0.4s, v1.4s
 fmul v3.4s, v1.4s, v2.4s
 st4 {v0.4s-v3.4s}, [x22], #64
 subs w23, w23, #1
 b.ne 1b
 mrs x1, fpsr
 str x1, [x19,#32]
 adrp x20, inputs
 add x20, x20, :lo12:inputs
 mov w23, w21
 mov w24, #0
2:
 ldr w1, [x20], #4
 add w24, w24, w1
 subs w23, w23, #1
 b.ne 2b
 str w24, [x19,#40]
 add x20, x19, #64
 lsl w23, w21, #2
 mov w24, #0
3:
 ldr w1, [x20], #4
 add w24, w24, w1
 subs w23, w23, #1
 b.ne 3b
 str w24, [x19,#44]
 mov x1, x19
 lsl x2, x21, #4
 add x2, x2, #64
4:
 mov x0, #1
 mov x8, #64
 svc #0
 cmp x0, #0
 b.le 5f
 add x1, x1, x0
 sub x2, x2, x0
 cbnz x2, 4b
 mov x0, #0
 b 6f
5:
 cmn x0, #4
 b.eq 4b
 mov x0, #1
6:
 mov x8, #93
 svc #0
.section .rodata
.balign 16
magic: .ascii "FRECPE49"
inputs: .incbin "inputs.bin"
.section .bss
.balign 16
output: .skip 64 + INPUT_COUNT*16
.section .note.GNU-stack,"",%progbits
