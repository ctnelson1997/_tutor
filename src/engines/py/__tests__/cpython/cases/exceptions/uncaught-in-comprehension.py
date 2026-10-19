# ends uncaught inside a list comprehension: CPython 3.12 runs it inlined, so the traceback has no <listcomp> frame
def parse(text):
    return int(text)

def parse_all(items):
    return [parse(t) for t in items]

print(parse_all(["1", "2"]))
values = parse_all(["3", "four", "5"])
print("never printed")
