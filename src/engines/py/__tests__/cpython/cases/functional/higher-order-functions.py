# Higher-order functions: passing functions in, returning them, apply_twice, and my_map/my_filter
def apply_twice(f, x):
    return f(f(x))

def my_map(f, items):
    result = []
    for item in items:
        result.append(f(item))
    return result

def my_filter(pred, items):
    return [x for x in items if pred(x)]

def make_validator(minimum, maximum):
    def is_valid(n):
        return minimum <= n <= maximum
    return is_valid

print(apply_twice(lambda s: s + "!", "hey"))
print(apply_twice(lambda n: n * 3, 2))
in_range = make_validator(1, 10)
data = [0, 5, 11, 7, -3, 10]
print(my_filter(in_range, data))
print(my_map(abs, data))
print(my_map(str, my_filter(lambda n: n % 2, data)))
funcs = [len, str.upper, lambda s: s[::-1]]
print([f("python") for f in funcs])
print(sorted(data, key=lambda n: (in_range(n), n)))
