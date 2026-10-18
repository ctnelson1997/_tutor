# module-level names shadowing builtins (list, sum, max, str, id, type, repr), calling a shadowed one, and del restoring them
list = [1, 2, 3]
print(list)
try:
    list("abc")
except TypeError as err:
    print("TypeError:", err)
sum = 0
for n in list:
    sum += n
print(sum)
max = "not a function"
print(max)
del list
del sum
del max
print(list("ab"), sum([1, 2]), max(3, 9))

def double(len):
    return len * 2

print(double(4), len("four"))
str = "shadowed str"
id = 7
type = "a type?"
repr = None
print(str, id, type, repr)
print(f"{3.5}", format(42), [1.5, "s"])
