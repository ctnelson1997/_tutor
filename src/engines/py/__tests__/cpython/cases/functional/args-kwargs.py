# *args and **kwargs, default arguments, and the mutable default argument gotcha
def describe(name, *args, sep=", ", **kwargs):
    print(name, args, kwargs)
    return name + ": " + sep.join(str(a) for a in args)

print(describe("nums", 1, 2, 3))
print(describe("mixed", "a", True, sep=" | ", color="red", size=3))
print(describe("none"))

def append_bad(item, bucket=[]):
    bucket.append(item)
    return bucket

def append_good(item, bucket=None):
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket

print(append_bad(1), append_bad(2), append_bad(3))
print(append_good(1), append_good(2))
print(append_bad.__defaults__)

def total(*nums, start=0):
    for n in nums:
        start += n
    return start

print(total(), total(1, 2, 3), total(1, 2, start=10))
