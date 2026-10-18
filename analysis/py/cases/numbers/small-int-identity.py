# `is` on ints: -5..256 are cached, a runtime 257 is a new object, equal constants in one code object are shared (prints booleans only)
a = 256
b = int("256")
print(a is b, a == b)
c = 257
d = int("257")
print(c is d, c == d)
e = 257
print(c is e)
x = -5
y = int("-5")
print(x is y)
p = -6
q = int("-6")
print(p is q, p == q)
s1 = "hello"
s2 = "hel" + "lo"
s3 = "".join(["hel", "lo"])
print(s1 is s2, s2 is s3, s2 == s3)
n = 1000
alias = n
print(alias is n)
alias += 1
print(alias is n, alias == n + 1)
t1 = (1, 2)
t2 = tuple([1, 2])
print(t1 == t2, t1 is t2)
