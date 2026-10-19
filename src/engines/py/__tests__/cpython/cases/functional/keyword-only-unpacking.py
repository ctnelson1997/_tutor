# Keyword-only and positional-only parameters, unpacking lists/dicts into calls, and TypeError messages
def make_user(name, /, age, *, admin=False):
    return {"name": name, "age": age, "admin": admin}

print(make_user("ann", 30))
print(make_user("bo", age=25, admin=True))
for bad in [lambda: make_user("cy", 20, True), lambda: make_user(name="di", age=1),
            lambda: make_user("ed"), lambda: make_user("fa", 1, root=True)]:
    try:
        bad()
    except TypeError as e:
        print("TypeError:", e)

def point(x, y, z=0):
    return (x, y, z)

coords = [1, 2, 3]
opts = {"y": 5, "z": 9}
print(point(*coords), point(1, **opts), point(*coords[:2]))
first, *middle, last = [10, 20, 30, 40, 50]
print(first, middle, last)
merged = {**opts, "x": 0, "z": -1}
print(merged, [*coords, *"ab"])
print(max(*coords), print(*coords, sep="-"))
