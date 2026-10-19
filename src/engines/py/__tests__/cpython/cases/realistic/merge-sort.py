# Sorts a list with recursive merge sort and shows each merge
def merge(left, right):
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result


def merge_sort(items, depth=0):
    if len(items) <= 1:
        return items
    mid = len(items) // 2
    left = merge_sort(items[:mid], depth + 1)
    right = merge_sort(items[mid:], depth + 1)
    merged = merge(left, right)
    print("  " * depth + f"merge {left} + {right} -> {merged}")
    return merged


data = [38, 27, 43, 3, 9, 82, 10]
sorted_data = merge_sort(data)
print("Sorted:", sorted_data)
print("Original unchanged:", data)
print("Two-list merge:", merge([1, 4, 9], [2, 3, 10, 11]))
