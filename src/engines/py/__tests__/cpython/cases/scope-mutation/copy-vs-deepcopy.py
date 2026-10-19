# copy.copy shares nested objects, copy.deepcopy duplicates them (keeping shared structure shared), also for class instances
import copy
original = [[1, 2], [3, 4], {"k": [5]}]
shallow = copy.copy(original)
deep = copy.deepcopy(original)
original[0].append(99)
original[2]["k"].append(6)
original.append("new")
print(original)
print(shallow)
print(deep)
print(shallow[0] is original[0], deep[0] is original[0])
shared = [0]
pair = [shared, shared]
pair_copy = copy.deepcopy(pair)
pair_copy[0].append(1)
print(pair_copy, pair_copy[0] is pair_copy[1], pair)

class Box:
    def __init__(self, items):
        self.items = items

b1 = Box([1])
b2 = copy.copy(b1)
b3 = copy.deepcopy(b1)
b2.items.append(2)
print(b1.items, b2.items, b3.items, b1 is b2)
