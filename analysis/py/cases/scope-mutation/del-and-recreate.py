# del removes a name (NameError after), then the name comes back with another type; del on list items, slices, dict keys and aliases
x = 10
print(x)
del x
try:
    print(x)
except NameError as err:
    print("NameError:", err)
x = "now a string"
print(x)
nums = [0, 1, 2, 3, 4, 5]
del nums[0]
del nums[-1]
del nums[1:3]
print(nums)
d = {"a": 1, "b": 2, "c": 3}
del d["b"]
print(d)
a = b = [7]
del a
print(b)
a = [8]
print(a, b)

def f():
    local = 1
    del local
    local = [2]
    return local

print(f())
del nums, d
print(x, a, b)
