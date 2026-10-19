# bin/hex/oct (also of negatives), bitwise ops on negative ints, big shifts, bit_length/bit_count, to_bytes/from_bytes
n = 10
print(bin(n), hex(255), oct(8), bin(-10), hex(-255))
print((255).bit_length(), (0).bit_length(), (-1).bit_length(), (12).bit_count())
print(~5, ~-1, -5 & 0xFF, -1 >> 3, -16 >> 2, 5 | 2, 6 ^ 3)
big = 1 << 70
mask = (1 << 64) - 1
print(big, mask, big >> 69, big & mask)
flags = 0
for bit in [0, 3, 5]:
    flags |= 1 << bit
print(flags, bin(flags), flags & (1 << 3) != 0)
data = (1024).to_bytes(2, "big")
back = int.from_bytes(data, "little")
print(data, back, list(data))
print(format(255, "08b"), format(10, "o"), format(-42, "x"), f"{3:03b}")
print(0b1010, 0o17, 0xFF, 1_000_000)
print(int("-101", 2), int("7f", 16), (-7) % 4, -7 & 3)
