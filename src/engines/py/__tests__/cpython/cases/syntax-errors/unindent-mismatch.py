# Syntax error: IndentationError, unindent does not match any outer indentation level
def average(nums):
    total = 0
    for n in nums:
        total += n
      return total / len(nums)

print(average([1, 2, 3]))
