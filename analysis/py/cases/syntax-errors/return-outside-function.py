# Syntax error: return outside a function (the def line was forgotten)
nums = [4, 8, 15]
biggest = nums[0]
for n in nums:
    if n > biggest:
        biggest = n
return biggest
