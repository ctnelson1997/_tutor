# List methods: insert (negative, past the end), pop(0)/pop(i)/pop(), remove first match, sort key, reverse, index, count
nums = [4, 1, 3]
nums.insert(0, 9)
nums.insert(-1, 7)
nums.insert(100, 5)
print(nums)
first = nums.pop(0)
last = nums.pop()
middle = nums.pop(1)
print(first, last, middle, nums)
letters = list("banana")
letters.remove("a")
print(letters, letters.count("a"), letters.index("n"), letters.index("n", 2))
words = ["pear", "Fig", "apple", "date"]
words.sort()
print(words)
words.sort(key=str.lower)
print(words)
words.sort(key=len, reverse=True)
print(words)
words.reverse()
print(words)
result = words.sort()
print(result)
nums.extend([2, 2])
nums.append([8])
print(nums, nums.count(2), len(nums))
try:
    nums.remove(42)
except ValueError as e:
    print("ValueError:", e)
try:
    print(nums.index(42))
except ValueError as e:
    print("ValueError:", e)
copy = nums.copy()
copy.clear()
print(copy, nums)
