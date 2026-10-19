# Slicing with steps and negative indices on lists, strings and tuples; out-of-range slices; slice objects in variables
nums = list(range(10))
print(nums[2:8:2], nums[::3], nums[::-1])
print(nums[-3:], nums[:-7], nums[-1:-4:-1])
print(nums[8:2:-2], nums[5:2], nums[100:], nums[-100:2])
print(nums[1::-1], nums[:5:-1])
word = "programming"
print(word[::2], word[-4:], word[3:-3], word[::-1])
evens = slice(0, None, 2)
last_three = slice(-3, None)
print(nums[evens], word[evens], nums[last_three])
print(evens.start, evens.stop, evens.step, evens.indices(10))
tup = (10, 20, 30, 40, 50)
part = tup[1:4]
print(part, type(part).__name__, tup[::-2])
grid = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
column = [row[1] for row in grid]
flipped = grid[::-1]
print(flipped, [row[::-1] for row in grid], column)
print(flipped[0] is grid[2])
copy = nums[:]
print(copy == nums, copy is nums)
try:
    nums[::0]
except ValueError as e:
    print("ValueError:", e)
