# an int with 5001 digits held in a variable (str() of it raises ValueError past 4300 digits); the program itself avoids printing it
x = 10 ** 5000
print(x.bit_length())
print(x % 997)
small = x // 10 ** 4990
print(small)
try:
    s = str(x)
except ValueError as err:
    print("ValueError:", str(err).split(";")[0])
y = x + 1
print(y - x, y % 10)
medium = 2 ** 10000
print(len(str(medium)), str(medium)[:10])
values = [x, 7]
print(len(values), values[1])
