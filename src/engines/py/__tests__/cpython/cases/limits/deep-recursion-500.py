# Deep but legal recursion: 500 frames on the stack at the deepest point, below the default limit
def sum_to(n):
    if n == 0:
        return 0
    return n + sum_to(n - 1)

def max_depth(n, seen):
    seen.append(n)
    if n < 500:
        max_depth(n + 1, seen)
    return len(seen)

print(sum_to(500))
print(max_depth(1, []))
