# Recursion past the default recursion limit raises RecursionError, caught; the program then continues
def depth(n):
    return depth(n + 1)

def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

try:
    depth(0)
except RecursionError as e:
    print("caught:", type(e).__name__, e)
result = factorial(10)
print("still running:", result)
