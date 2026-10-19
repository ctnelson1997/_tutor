# assert with and without a message; AssertionError caught; asserts used to test a function
def average(nums):
    assert len(nums) > 0, "need at least one number"
    return sum(nums) / len(nums)

def is_sorted(items):
    return all(items[i] <= items[i + 1] for i in range(len(items) - 1))

print(average([2, 4, 9]))
try:
    average([])
except AssertionError as e:
    print("AssertionError:", e)

tests = [([1, 2, 3], True), ([3, 1], False), ([], True), ([5, 5], False)]
passed = 0
for items, expected in tests:
    try:
        assert is_sorted(items) == expected
        passed += 1
    except AssertionError as e:
        print("failed for", items, repr(e), e.args)
print(passed, "of", len(tests), "passed")
x = 5
try:
    assert x > 10, f"x is {x}"
except AssertionError as e:
    print(e)
