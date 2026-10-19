# any() and all() over generators (short-circuit), empty iterables, and validation checks
def check(n):
    print("  checking", n)
    return n > 3

nums = [1, 5, 2, 8]
print(any(check(n) for n in nums))
print(all(check(n) for n in nums))
print(any([]), all([]))
password = "Secret123"
rules = [
    len(password) >= 8,
    any(c.isupper() for c in password),
    any(c.isdigit() for c in password),
    not all(c.isalnum() for c in password),
]
print(rules, all(rules[:3]))
grid = [[1, 1], [1, 0]]
print(all(all(row) for row in grid), any(0 in row for row in grid))
