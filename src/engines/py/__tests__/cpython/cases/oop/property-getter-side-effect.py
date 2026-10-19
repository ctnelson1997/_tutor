# A property getter with a side effect: it should run only when the program reads it
class Account:
    reads = 0

    def __init__(self, owner, cents):
        self.owner = owner
        self._cents = cents

    @property
    def balance(self):
        Account.reads += 1
        print("  (balance read)")
        return self._cents / 100

    @property
    def summary(self):
        return f"{self.owner}: ${self.balance:.2f}"

acct = Account("Ann", 12345)
print("created")
x = acct.balance
print(x)
print(acct.summary)
acct._cents += 500
print("reads so far:", Account.reads)
y = acct.balance
print(y, Account.reads)
