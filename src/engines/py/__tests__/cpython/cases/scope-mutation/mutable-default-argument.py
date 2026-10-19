# a mutable default argument is created once and shared by every call that uses the default; the None-default fix
def append_to(item, bucket=[]):
    bucket.append(item)
    return bucket

first = append_to(1)
second = append_to(2)
print(first, second, first is second)
third = append_to(3, [])
print(third, first)

def safe_append(item, bucket=None):
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket

x = safe_append(1)
y = safe_append(2)
print(x, y)
print(append_to.__defaults__)

def counter(memo={}):
    memo["calls"] = memo.get("calls", 0) + 1
    return memo["calls"]

print(counter(), counter(), counter())
print(counter.__defaults__)
