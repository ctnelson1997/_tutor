# complex numbers in variables: repr with and without parentheses, -0 parts, abs/conjugate, cmath
import cmath
z = 3 + 4j
w = complex(1, -1)
i2 = 1j ** 2
neg = -1j
zero = complex(0, 0)
pure = 2j
print(z, w, i2, neg, zero, pure)
print(abs(z), z.real, z.imag, z.conjugate())
print(z * z, z / 2, z + w, z - z)
print(cmath.sqrt(-1), cmath.sqrt(-4))
print(complex("1+2j"), z == 3 + 4j, z != w)
print(f"{z:.2f}", str(w), repr(neg))
print([z, w, neg])
print(round(cmath.phase(1j), 4), round(abs(cmath.exp(1j * cmath.pi) + 1), 10))
roots = [complex(-1, 0) ** 0.5, (1 + 1j) ** 2]
print(roots)
