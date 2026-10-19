# A realistic BankAccount class: deposits, withdrawals that can fail, a transfer and a history list
class InsufficientFunds(Exception):
    pass

class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance
        self.history = []

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("deposit must be positive")
        self.balance += amount
        self.history.append(("deposit", amount))

    def withdraw(self, amount):
        if amount > self.balance:
            raise InsufficientFunds(f"{self.owner} has only {self.balance}")
        self.balance -= amount
        self.history.append(("withdraw", amount))

    def transfer(self, other, amount):
        self.withdraw(amount)
        other.deposit(amount)

    def __repr__(self):
        return f"<{self.owner}: {self.balance}>"

alice = BankAccount("Alice", 100)
bob = BankAccount("Bob")
alice.transfer(bob, 30)
for amount in [50, 500, -5]:
    try:
        if amount > 0:
            bob.withdraw(amount) if amount < 100 else alice.withdraw(amount)
        else:
            bob.deposit(amount)
    except (InsufficientFunds, ValueError) as e:
        print(type(e).__name__, e)
print(alice, bob)
print(bob.history)
