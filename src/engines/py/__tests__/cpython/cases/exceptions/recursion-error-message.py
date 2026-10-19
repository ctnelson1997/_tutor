# RecursionError's type and message when a recursive function has no base case (caught, depth not printed)
import sys

def countdown(n):
    return countdown(n - 1)       # forgot the base case

def safe_countdown(n):
    if n <= 0:
        return "done"
    return safe_countdown(n - 1)

sys.setrecursionlimit(150)
try:
    countdown(10)
except RecursionError as e:
    print(type(e).__name__, e)
    print(isinstance(e, RuntimeError))
print(safe_countdown(20))
print(sys.getrecursionlimit())
