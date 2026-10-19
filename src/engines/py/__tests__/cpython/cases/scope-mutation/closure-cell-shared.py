# two closures share one cell (deposit/get), a second factory call makes new cells, and a closure sees later reassignment
def make_account(balance):
    def deposit(amount):
        nonlocal balance
        balance += amount
        return balance
    def get():
        return balance
    return deposit, get

deposit, get = make_account(100)
deposit(25)
print(get())
deposit2, get2 = make_account(0)
deposit2(5)
print(get(), get2())
print(deposit.__closure__[0].cell_contents, get.__closure__[0].cell_contents)
print(deposit.__closure__[0] is get.__closure__[0], deposit is deposit2)

def outer():
    x = 1
    f = lambda: x
    x = 2
    return f

late = outer()
print(late())
