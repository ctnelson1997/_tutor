# a recursive function near a lowered recursion limit: CPython raises RecursionError, caught
import sys
sys.setrecursionlimit(120)

def depth(n):
    return depth(n + 1)

try:
    depth(0)
except RecursionError as e:
    print("caught:", type(e).__name__)
print("after")
