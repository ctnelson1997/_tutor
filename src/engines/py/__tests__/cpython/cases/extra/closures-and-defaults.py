# A closure's variables and a function's defaults live on with the function (#82).
def make_counter():
    count = 0
    def inc():
        nonlocal count
        count += 1
        return count
    return inc
c1 = make_counter(); c2 = make_counter()
c1(); c1(); c2()
print(c1(), c2())
def add_item(item, bucket=[]):
    bucket.append(item)
    return bucket
add_item('a')
x = 1
print(add_item('b'))
