# itertools.groupby (needs sorted input) and accumulate (running sums, products, maximums)
from itertools import groupby, accumulate
import operator

words = ["apple", "avocado", "banana", "blueberry", "cherry", "apricot"]
for letter, group in groupby(words, key=lambda w: w[0]):
    print(letter, list(group))
print("--- sorted first")
for letter, group in groupby(sorted(words), key=lambda w: w[0]):
    print(letter, list(group))
runs = [(k, len(list(g))) for k, g in groupby("aaabccdddd")]
print(runs)
print(list(accumulate([1, 2, 3, 4, 5])))
print(list(accumulate([1, 2, 3, 4, 5], operator.mul)))
print(list(accumulate([3, 1, 4, 1, 5, 9, 2], max)))
print(list(accumulate([10, -3, -4], initial=100)))
