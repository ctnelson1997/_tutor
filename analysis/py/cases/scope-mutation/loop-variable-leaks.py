# a for loop's variable survives the loop, a comprehension's does not, an empty loop never binds it, and loops can rebind existing names
for i in range(3):
    pass
print(i)
squares = [n * n for n in range(4)]
try:
    print(n)
except NameError as err:
    print("NameError:", err)
for k in []:
    pass
try:
    print(k)
except NameError as err:
    print("NameError:", err)
word = "hey"
for ch in word:
    last = ch
print(ch, last)
total = 0
for total in range(5):
    pass
print(total)
x = "outer x"
results = [x for x in "ab"]
print(x, results, squares)
count = 0
while count < 3:
    count += 1
print(count)
