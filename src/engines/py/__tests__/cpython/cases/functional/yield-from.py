# yield from: delegating to another generator, recursive flattening, and the delegate's return value
def inner():
    yield 1
    yield 2
    return "inner done"

def outer():
    result = yield from inner()
    print("  inner returned", result)
    yield 3

def flatten(items):
    for item in items:
        if isinstance(item, list):
            yield from flatten(item)
        else:
            yield item

print(list(outer()))
nested = [1, [2, [3, [4, 5]], 6], [], [[7]]]
print(list(flatten(nested)))

def chain_all(*iterables):
    for it in iterables:
        yield from it

print(list(chain_all("ab", range(2), (9,))))
gen = flatten([[10, 20], 30])
print(next(gen))
