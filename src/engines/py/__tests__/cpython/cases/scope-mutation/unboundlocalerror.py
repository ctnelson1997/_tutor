# assigning a name anywhere in a function makes it local there, so reading it first raises; ends with an uncaught UnboundLocalError
total = 10

def show_total():
    return total

print(show_total())

def add_to_total(n):
    print("adding", n)
    total = total + n
    return total

result = add_to_total(5)
print("never printed", result)
