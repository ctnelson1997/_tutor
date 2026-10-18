# functools.lru_cache memoizes a recursive function; cache_info shows hits and misses
from functools import lru_cache

calls = 0

def slow_fib(n):
    global calls
    calls += 1
    return n if n < 2 else slow_fib(n - 1) + slow_fib(n - 2)

@lru_cache(maxsize=None)
def fast_fib(n):
    return n if n < 2 else fast_fib(n - 1) + fast_fib(n - 2)

print(slow_fib(10), calls)
print(fast_fib(12))
print(fast_fib.cache_info())
print(fast_fib(30))
print(fast_fib.cache_info())
fast_fib.cache_clear()
print(fast_fib.cache_info().currsize)
