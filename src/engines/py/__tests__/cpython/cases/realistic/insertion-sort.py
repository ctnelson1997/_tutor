# Sorts a list in place with insertion sort, printing the list after each insertion
def insertion_sort(arr):
    shifts = 0
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0 and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
            shifts += 1
        arr[j + 1] = key
        print(f"after inserting {key!r:>8}: {arr}")
    return shifts


values = [31, 41, 59, 26, 41, 58, 12]
original = values.copy()
moves = insertion_sort(values)
print("Before:", original)
print("After: ", values)
print("Shifts:", moves)

words = ["pear", "fig", "apple", "kiwi", "banana"]
word_moves = insertion_sort(words)
print("Words:", words, "shifts:", word_moves)
same_object = original is values
print("Copy differs from sorted list:", original != values and not same_object)
