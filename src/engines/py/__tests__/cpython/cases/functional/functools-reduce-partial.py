# functools.reduce with and without an initial value, and functools.partial
from functools import reduce, partial
import operator

nums = [3, 1, 4, 1, 5, 9]
print(reduce(lambda a, b: a + b, nums))
print(reduce(operator.mul, nums, 1))
print(reduce(lambda acc, x: acc if acc > x else x, nums))
print(reduce(lambda acc, w: acc + w[0], ["hello", "old", "world"], ""))
print(reduce(operator.add, [], 0))
try:
    reduce(operator.add, [])
except TypeError as e:
    print("TypeError:", e)

def power(base, exponent):
    return base ** exponent

square = partial(power, exponent=2)
two_to = partial(power, 2)
print(square(9), two_to(10))
int_from_binary = partial(int, base=2)
print(int_from_binary("1011"), square.func.__name__, square.keywords)
