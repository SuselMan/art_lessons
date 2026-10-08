"""CPU integer oracle only. No runtime/shader import or GPU-equivalence claim."""
import struct
import unittest


def bits(value):
    return struct.unpack('<I', struct.pack('<f', value))[0]


def decode(word):
    exponent = (word >> 23) & 255
    if exponent == 255:
        raise ValueError('Nonfinite input')
    mantissa = (word & 0x7fffff) | (0x800000 if exponent else 0)
    return (-mantissa if word >> 31 else mantissa), (exponent - 150 if exponent else -149)


def rounded_shift(value, shift):
    if shift <= 0:
        return value << -shift
    quotient, remainder = divmod(value, 1 << shift)
    halfway = 1 << (shift - 1)
    return quotient + (remainder > halfway or (remainder == halfway and quotient & 1))


def single_round(a, b, c):
    """Exact integer a*b+c, one nearest/ties-even binary32 rounding.

    Finite inputs only. Exact cancellation returns +0 (round-to-nearest).
    Underflow is gradual. Overflow is rejected, not silently clamped.
    """
    am, ae = decode(a)
    bm, be = decode(b)
    cm, ce = decode(c)
    exponent = min(ae + be, ce)
    total = (am * bm << (ae + be - exponent)) + (cm << (ce - exponent))
    if not total:
        return 0
    sign = 0x80000000 if total < 0 else 0
    magnitude = abs(total)
    top = magnitude.bit_length() - 1 + exponent
    if top < -126:
        encoded = rounded_shift(magnitude, -149 - exponent)
        return sign | encoded  # includes rounding up to minimum normal
    significand = rounded_shift(magnitude, magnitude.bit_length() - 24)
    if significand == 1 << 24:
        significand >>= 1
        top += 1
    if top > 127:
        raise ValueError('Overflow')
    return sign | ((top + 127) << 23) | (significand & 0x7fffff)


def bounded_octave(value, offset):
    """QA candidate domain only: finite F32 |p|<=65536, original offsets."""
    decode(value)
    if (value & 0x7fffffff) > bits(65536):
        raise ValueError('Outside bounded coordinate domain')
    if offset not in (bits(31.4), bits(17.9)):
        raise ValueError('Unknown original offset')
    return single_round(value, bits(2.7), offset)


class ReferenceTests(unittest.TestCase):
    def test_ties_even(self):
        self.assertEqual(single_round(bits(1), bits(1), bits(2**-24)), bits(1))
        self.assertEqual(single_round(bits(1), 0x3f800001, bits(2**-24)), 0x3f800002)

    def test_sign_and_cancel(self):
        self.assertEqual(single_round(bits(-2), bits(3), bits(6)), 0)
        self.assertEqual(single_round(bits(-2), bits(3), bits(5)), bits(-1))

    def test_subnormal_and_underflow(self):
        self.assertEqual(single_round(1, bits(1), 0), 1)
        self.assertEqual(single_round(1, bits(.5), 0), 0)
        self.assertEqual(single_round(3, bits(.5), 0), 2)
        self.assertEqual(bounded_octave(1, bits(17.9)), bits(17.9))
        self.assertEqual(bounded_octave(0x80000000, bits(17.9)), bits(17.9))

    def test_captured_coordinate(self):
        self.assertEqual(bounded_octave(bits(29.47861099243164), bits(17.9)), bits(97.49224853515625))
        self.assertEqual(bounded_octave(bits(-4.666445255279541), bits(31.4)), bits(18.80059814453125))

    def test_guards(self):
        for value in (bits(65537), 0x7f800000, 0x7fc00000):
            with self.assertRaises(ValueError):
                bounded_octave(value, bits(17.9))
        with self.assertRaises(ValueError):
            bounded_octave(bits(1), bits(18))
        with self.assertRaises(ValueError):
            single_round(0x7f7fffff, bits(2), 0)


if __name__ == '__main__':
    unittest.main()
