# recursion passing one list down by reference: collecting results, backtracking with copies, and the bug of appending the same list
def collect_evens(nums, i, acc):
    if i == len(nums):
        return acc
    if nums[i] % 2 == 0:
        acc.append(nums[i])
    return collect_evens(nums, i + 1, acc)

result = []
returned = collect_evens([1, 2, 3, 4, 6], 0, result)
print(result, returned is result)

def subsets(items, i, current, out):
    if i == len(items):
        out.append(current[:])
        return
    subsets(items, i + 1, current, out)
    current.append(items[i])
    subsets(items, i + 1, current, out)
    current.pop()

all_sets = []
subsets(["a", "b", "c"], 0, [], all_sets)
print(all_sets)

def subsets_bug(items, i, current, out):
    if i == len(items):
        out.append(current)
        return
    subsets_bug(items, i + 1, current, out)
    current.append(items[i])
    subsets_bug(items, i + 1, current, out)
    current.pop()

aliased = []
subsets_bug([1, 2], 0, [], aliased)
print(aliased, aliased[0] is aliased[-1])
