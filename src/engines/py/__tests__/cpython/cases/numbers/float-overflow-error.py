# repeatedly squaring a float grows to 1.3e154, then the next ** raises OverflowError; ends with an uncaught OverflowError
x = 2.0
step = 0
while True:
    print(step, x)
    x = x ** 2
    step += 1
