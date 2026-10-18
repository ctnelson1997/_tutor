# Removes duplicates from lists while keeping the original order, three different ways
def dedupe_loop(items):
    result = []
    for item in items:
        if item not in result:
            result.append(item)
    return result


def dedupe_seen(items):
    seen = set()
    result = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def dedupe_dict(items):
    return list(dict.fromkeys(items))


nums = [4, 2, 7, 2, 9, 4, 4, 1, 7, 3]
colors = ["red", "blue", "red", "green", "blue", "yellow"]

a = dedupe_loop(nums)
b = dedupe_seen(nums)
c = dedupe_dict(nums)
print("Numbers:", nums)
print("Loop:  ", a)
print("Set:   ", b)
print("Dict:  ", c)
print("All agree:", a == b == c)

unique_colors = dedupe_dict(colors)
print("Colors:", unique_colors)
duplicates = sorted({n for n in nums if nums.count(n) > 1})
print("Repeated numbers:", duplicates)
removed = len(nums) - len(a)
print("Removed", removed, "duplicates")
