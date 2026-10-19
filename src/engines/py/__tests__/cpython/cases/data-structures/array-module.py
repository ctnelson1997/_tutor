# array.array: typed arrays of ints and floats, append/insert/pop, typecode/itemsize, tolist, overflow and type errors
from array import array

nums = array("i", [3, 1, 4])
nums.append(1)
nums.insert(0, 9)
print(nums, nums.typecode, len(nums), nums[1], nums[-1])
removed = nums.pop()
nums.remove(1)
print(removed, nums, nums.count(4), nums.index(4))
nums.extend([5, 9])
nums.reverse()
print(nums, nums.tolist(), sum(nums))
part = nums[1:3]
print(part, type(part).__name__)
temps = array("d", [20.5, 21.0])
temps.append(19)
print(temps, temps.itemsize, temps[2])
small = array("b", [100])
try:
    small.append(200)
except OverflowError as e:
    print("OverflowError:", e)
try:
    nums.append(1.5)
except TypeError as e:
    print("TypeError:", e)
chars = array("u", "hey")
print(chars, chars.tounicode())
grid = array("i", [0]) * 4
grid[2] = 7
print(grid, list(grid), array("i") == array("i", []))
