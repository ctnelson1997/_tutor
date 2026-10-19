# tuple swap, chained assignment to one list, starred unpacking, nested unpacking, and left-to-right targets (i, nums[i] = ...)
a, b = 1, 2
a, b = b, a
print(a, b)
x = y = z = []
x.append(1)
print(x, y, z, x is z)
first, *middle, last = [1, 2, 3, 4, 5]
print(first, middle, last)
head, *tail = "abc"
print(head, tail)
*init, end = (1,)
print(init, end)
nums = [0, 0, 0]
i = 0
i, nums[i] = 2, 9
print(i, nums)
p = q = 5
p += 1
print(p, q)
(m, n), o = (1, 2), 3
print(m, n, o)
c1, c2, c3 = "xyz"
print(c1, c2, c3)
