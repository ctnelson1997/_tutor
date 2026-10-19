# A simple decorator that wraps a function, printing before and after each call
def logged(func):
    def wrapper(*args):
        print(f"-> {func.__name__}{args}")
        result = func(*args)
        print(f"<- {func.__name__} = {result}")
        return result
    return wrapper

@logged
def add(a, b):
    return a + b

@logged
def greet(name):
    return "Hello, " + name

def square(x):
    return x * x

square = logged(square)       # the same thing without @
total = add(2, 3)
msg = greet("Ann")
sq = square(add(1, 1))
print(total, msg, sq)
print(add.__name__)
