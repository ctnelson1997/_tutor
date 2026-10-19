# print(*iterable) unpacking: lists, strings, ranges, dicts, an empty list (blank line), with sep
nums = [3, 1, 4, 1, 5]
print(*nums)
print(*nums, sep=", ")
print(*"abc", sep="-")
print(*range(5), sep="")
empty = []
print(*empty)
print("before", *empty, "after")
d = {"x": 1, "y": 2}
print(*d)
print(*d.items())
print(*[[1, 2], [3]], sep=" | ")
words = ["a", "b"]
print("start", *words, 99, *nums[:2], end=".\n")
matrix = [[1, 2, 3], [4, 5, 6]]
for row in matrix:
    print(*row)
print(*(x * x for x in nums))
