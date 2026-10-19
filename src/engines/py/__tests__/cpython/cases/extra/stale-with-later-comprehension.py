# a later comprehension that reuses a loop variable name must not make earlier steps show stale values (PEP 709)
for name in ["a", "b", "c"]:
    if name:
        last = name
print(last)
upper = [name.upper() for name in ["x"]]
print(name, upper)
