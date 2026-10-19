# sorted(key=, reverse=), stable sorting by several keys, min/max with key and default
people = [("Ann", 31, "NY"), ("bo", 25, "LA"), ("Cy", 31, "LA"), ("di", 25, "NY")]
print(sorted(people))
print(sorted(people, key=lambda p: p[1]))
print(sorted(people, key=lambda p: (-p[1], p[0].lower())))
print(sorted(people, key=lambda p: p[0].lower(), reverse=True))
by_city = sorted(sorted(people, key=lambda p: p[0]), key=lambda p: p[2])
print(by_city)
print(min(people, key=lambda p: p[1]), max(people, key=lambda p: p[1]))
print(max([], default="none"), min("hello"), max("apple", "Banana", key=str.lower))
words = "the quick brown fox jumps".split()
print(sorted(words, key=len), sorted(words, key=lambda w: w[-1]))
nums = [5, -2, 9, -7]
nums.sort(key=abs)
print(nums)
