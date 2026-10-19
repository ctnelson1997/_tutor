# f-string conversions !r/!s/!a and the = debugging specifier (with spaces, specs, expressions)
name = "Zoë"
quote = "it's"
items = [1, "two"]
value = 3.14159
x = 10
print(f"{name} {name!r} {name!s} {name!a}")
print(f"{quote!r} {items!r} {items!s}")
print(f"{x=}")
print(f"{x = }")
print(f"{value=:.2f}")
print(f"{name=}")
print(f"{name=!s}")
print(f"{items=}")
print(f"{x * 2 + 1=}")
print(f"{len(items)=} {items[1]=}")
print(f"{value = :>10.3f}|")
print(f"{None=} {True=}")
nested = {"key": [1.0, "a\tb"]}
print(f"{nested=}")
print(f"{'braces'} {{literal}} {{{x}}}")
