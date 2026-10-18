# itertools chain, product, permutations and combinations (counts and contents)
from itertools import chain, product, permutations, combinations

print(list(chain([1, 2], "ab", range(3))))
print(list(chain.from_iterable([[1], [2, 3], []])))
print(list(product("AB", [0, 1])))
print(list(product([0, 1], repeat=3))[:4])
dice = [a + b for a, b in product(range(1, 7), repeat=2)]
print(len(dice), dice.count(7))
print(list(permutations("abc")))
print(["".join(p) for p in permutations("abcd", 2)][:6])
print(list(combinations([1, 2, 3, 4], 2)))
teams = list(combinations(["Ann", "Bo", "Cy", "Di"], 3))
print(len(teams), teams[0])
