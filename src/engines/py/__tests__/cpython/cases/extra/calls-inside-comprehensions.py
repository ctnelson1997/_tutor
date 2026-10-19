# a function called from a list comprehension and a generator expression: frames and return values
def square(n):
    result = n * n
    return result

squares = [square(i) for i in range(3)]
total = sum(square(i) for i in range(3))
print(squares, total)
