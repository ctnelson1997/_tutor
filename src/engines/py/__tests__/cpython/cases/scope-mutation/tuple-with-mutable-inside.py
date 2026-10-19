# a tuple's list can change; t[0] += [4] mutates the list AND raises TypeError; tuples holding lists aren't hashable
t = ([1, 2], "label")
t[0].append(3)
print(t)
try:
    t[0] += [4]
except TypeError as err:
    print("TypeError:", err)
print(t)
try:
    t[1] = "new"
except TypeError as err:
    print("TypeError:", err)
key_ok = (1, 2)
d = {key_ok: "fine"}
try:
    d[([1],)] = "bad"
except TypeError as err:
    print("TypeError:", err)
print(d)
frozen = (t, t)
t[0].clear()
print(frozen)
