# Models bank accounts with deposits, withdrawals, transfers, and an overdraft error
class InsufficientFunds(Exception):
    pass


class BankAccount:
    interest_rate = 0.02

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
            raise InsufficientFunds(f"{self.owner} has only ${self.balance}")
        self.balance -= amount
        self.history.append(("withdraw", amount))

    def transfer(self, other, amount):
        self.withdraw(amount)
        other.deposit(amount)

    def add_interest(self):
        interest = round(self.balance * BankAccount.interest_rate, 2)
        self.deposit(interest)
        return interest

    def __str__(self):
        return f"{self.owner}: ${self.balance:.2f}"


alice = BankAccount("Alice", 100)
bob = BankAccount("Bob")
alice.deposit(50)
alice.transfer(bob, 70)
print(alice)
print(bob)

try:
    bob.withdraw(500)
except InsufficientFunds as e:
    print("Error:", e)

try:
    alice.deposit(-5)
except ValueError as e:
    print("Error:", e)

earned = alice.add_interest()
print("Interest earned:", earned)
print(alice)
print("Alice history:", alice.history)
print("Bob history:", bob.history)
accounts = [alice, bob]
total = sum(acct.balance for acct in accounts)
print("Bank total:", total)
