# Compares linear search with iterative and recursive binary search on a sorted list
def linear_search(items, target):
    steps = 0
    for i in range(len(items)):
        steps += 1
        if items[i] == target:
            return i, steps
    return -1, steps


def binary_search(items, target):
    low = 0
    high = len(items) - 1
    steps = 0
    while low <= high:
        steps += 1
        mid = (low + high) // 2
        if items[mid] == target:
            return mid, steps
        elif items[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1, steps


def binary_search_rec(items, target, low, high):
    if low > high:
        return -1
    mid = (low + high) // 2
    if items[mid] == target:
        return mid
    if items[mid] < target:
        return binary_search_rec(items, target, mid + 1, high)
    return binary_search_rec(items, target, low, mid - 1)


data = [3, 8, 12, 17, 23, 31, 42, 56, 64, 77, 89, 95]
results = []
for target in [42, 3, 95, 50]:
    lin = linear_search(data, target)
    bin_ = binary_search(data, target)
    rec = binary_search_rec(data, target, 0, len(data) - 1)
    results.append((target, lin[0], bin_[0], rec))
    print(f"target {target}: linear {lin}, binary {bin_}, recursive {rec}")

found = [r for r in results if r[1] != -1]
print("Found", len(found), "of", len(results))
