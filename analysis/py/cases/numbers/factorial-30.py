# a running factorial passes 2**53 and 2**64 while the loop runs; every step's value must be exact
result = 1
for i in range(1, 31):
    result *= i
    if i % 5 == 0 or i in (18, 19, 21):
        print(i, result)
print(result > 2 ** 64, result.bit_length())
digits = str(result)
print(len(digits), digits[:5], digits[-7:])
trailing_zeros = len(digits) - len(digits.rstrip("0"))
print(trailing_zeros)
