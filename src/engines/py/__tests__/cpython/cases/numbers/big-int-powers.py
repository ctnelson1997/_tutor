# big ints held in variables and containers (2**100, 2**53+1, 2**64, negative) must show exactly, not as JS doubles
a = 2 ** 100
b = 2 ** 64 - 1
c = -(2 ** 70)
d = 2 ** 53 + 1
e = 9007199254740993
f = 10 ** 20
g = 123456789 * 987654321 * 111111111
print(a)
print(b, c)
print(d, e, d == e)
print(d - 2 ** 53, float(d) == d, int(float(d)))
print(f, f + 1, f * f)
print(g)
print(a // 3, a % 7, len(str(a)))
nums = [2 ** 63, -2 ** 63, 2 ** 63 - 1]
print(nums)
lookup = {2 ** 64: "big key", 1: "small"}
print(lookup)
pair = (d, -d)
print(pair, sum(nums))
