# endless: while True calls a function every iteration and prints every 1000 iterations; never terminates
def tick(n):
    if n % 1000 == 0:
        print("still going", n)
    return n + 1

counter = 0
while True:
    counter = tick(counter)
