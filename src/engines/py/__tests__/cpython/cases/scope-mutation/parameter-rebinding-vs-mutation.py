# assigning to a parameter rebinds only the local name; mutating the object it names is visible to the caller
def rebind(lst):
    lst = [9, 9]
    return lst

def mutate(lst):
    lst.append(9)

def bump(n):
    n += 1
    return n

def mutate_then_rebind(lst):
    lst.append("kept")
    lst = ["lost"]
    lst.append("also lost")

data = [1]
r = rebind(data)
print(data, r)
mutate(data)
print(data)
num = 5
print(bump(num), num)
mutate_then_rebind(data)
print(data)

def update_dict(d):
    d["new"] = True
    d = {}
    d["gone"] = True

config = {"a": 1}
update_dict(config)
print(config)
