# Generates permutations and subsets of short lists recursively
def permutations(items):
    if len(items) <= 1:
        return [items[:]]
    result = []
    for i in range(len(items)):
        first = items[i]
        rest = items[:i] + items[i + 1:]
        for perm in permutations(rest):
            result.append([first] + perm)
    return result


def subsets(items):
    if not items:
        return [[]]
    without_first = subsets(items[1:])
    with_first = [[items[0]] + s for s in without_first]
    return without_first + with_first


perms = permutations([1, 2, 3])
print(len(perms), "permutations:")
for p in perms:
    print(" ", p)

words = ["".join(p) for p in permutations(list("cat"))]
print("Anagrams of cat:", words)

subs = subsets(["a", "b", "c"])
print(len(subs), "subsets:", subs)
pairs = [s for s in subs if len(s) == 2]
print("Pairs:", pairs)
