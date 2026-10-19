# Sorts a list with bubble sort, counting comparisons and swaps and stopping early when sorted
def bubble_sort(items):
    arr = items[:]
    comparisons = 0
    swaps = 0
    n = len(arr)
    for i in range(n - 1):
        swapped = False
        for j in range(n - 1 - i):
            comparisons += 1
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swaps += 1
                swapped = True
        print(f"pass {i + 1}: {arr}")
        if not swapped:
            break
    return arr, comparisons, swaps


numbers = [29, 10, 14, 37, 13, 5, 41, 22]
result, comps, swaps = bubble_sort(numbers)
print("Original:", numbers)
print("Sorted:  ", result)
print("Comparisons:", comps, "Swaps:", swaps)

nearly = [1, 2, 4, 3, 5, 6]
result2, comps2, swaps2 = bubble_sort(nearly)
print("Nearly sorted needed", comps2, "comparisons and", swaps2, "swap")
print("Correct:", result == sorted(numbers) and result2 == sorted(nearly))
