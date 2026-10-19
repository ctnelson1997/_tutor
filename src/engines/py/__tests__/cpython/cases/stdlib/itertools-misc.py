# More itertools: count, cycle and repeat with islice, zip_longest, combinations_with_replacement, pairwise, starmap
from itertools import count, cycle, repeat, islice, zip_longest, combinations_with_replacement, pairwise, starmap, compress, dropwhile

print(list(zip(count(1), "abc")))
print(list(islice(count(10, 5), 4)))
turns = cycle(["Ann", "Bo", "Cy"])
print([next(turns) for _ in range(7)])
print(list(repeat("x", 3)), list(map(pow, [2, 3], repeat(2))))
print(list(zip_longest([1, 2, 3], "ab", fillvalue="-")))
print(list(combinations_with_replacement("AB", 2)))
temps = [60, 64, 61, 70, 75]
print([b - a for a, b in pairwise(temps)])
print(list(starmap(lambda a, b: a * b, [(2, 3), (4, 5)])))
print(list(compress("ABCDE", [1, 0, 1, 0, 1])), list(dropwhile(lambda t: t < 65, temps)))
