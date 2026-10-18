# map and filter are lazy iterators: consumed once, partly consumed, and turned into lists
nums = [3, 8, 1, 6, 10, 7]
doubled = map(lambda n: n * 2, nums)
evens = filter(lambda n: n % 2 == 0, nums)
print(type(doubled).__name__, type(evens).__name__)
print(next(doubled), next(doubled))
print(list(doubled))
print(list(doubled))          # already exhausted
print(list(evens))
words = ["apple", "Kiwi", "banana", "fig"]
lengths = list(map(len, words))
print(lengths)
print(list(map(str.lower, words)))
print(list(filter(None, [0, 1, "", "a", None, [], [0]])))
print(list(map(lambda a, b: a * b, [1, 2, 3], [4, 5, 6, 7])))
total = sum(map(int, "1 2 3 4".split()))
print(total)
