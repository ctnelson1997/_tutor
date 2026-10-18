# ends uncaught: a factorial with no base case recurses past the default limit (RecursionError traceback)
def factorial(n):
    return n * factorial(n - 1)

print("computing")
print(factorial(5))
print("never printed")
