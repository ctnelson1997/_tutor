# Comprehension variables don't leak (but for-loop variables do); the class-body comprehension gotcha
x = "outer"
squares = [x * x for x in range(4)]
print(x, squares)
try:
    print(n)
except NameError as e:
    print("NameError:", e)
evens = [n for n in range(5) if n % 2 == 0]
try:
    print(n)
except NameError as e:
    print("NameError:", e)
for i in range(3):
    pass
print("loop variable leaks:", i)

class Config:
    factor = 10
    values = [v * 2 for v in range(3)]          # fine: only uses v
    try:
        scaled = [v * factor for v in range(3)]  # class names aren't visible here
    except NameError as e:
        scaled = str(e)

print(Config.values, Config.scaled)
total = sum(k for k in range(5))
print(total)
