# functools.wraps keeps the name/docstring; stacked decorators apply bottom-up and run top-down
import functools

def bold(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        return "<b>" + func(*args, **kwargs) + "</b>"
    return wrapper

def italic(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        return "<i>" + func(*args, **kwargs) + "</i>"
    return wrapper

def plain(func):
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper

@bold
@italic
def hello(name):
    """Say hello."""
    return "hi " + name

@plain
def other():
    """Docs that get lost."""
    return "x"

print(hello("Ann"))
print(hello.__name__, hello.__doc__)
print(other.__name__, other.__doc__)
print(hello.__wrapped__("Bo"))
