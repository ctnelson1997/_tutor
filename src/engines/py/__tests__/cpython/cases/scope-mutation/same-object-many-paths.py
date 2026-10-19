# one object reachable through a dict, a list (twice), a tuple and an attribute; changes through each path hit the same object
class Account:
    def __init__(self, owner, balance):
        self.owner = owner
        self.balance = balance

class Bank:
    def __init__(self):
        self.primary = None

acct = Account("Mo", 100)
by_name = {"Mo": acct}
everyone = [acct, acct]
pair = (acct, "checking")
bank = Bank()
bank.primary = acct
by_name["Mo"].balance += 50
everyone[1].balance -= 30
pair[0].balance *= 2
bank.primary.balance += 1
print(acct.balance, everyone[0].balance, pair[0].balance, by_name["Mo"].balance)
print(everyone[0] is everyone[1] is pair[0] is bank.primary)
shared_list = ["x"]
holder = {"a": shared_list, "b": [shared_list, shared_list]}
holder["b"][0].append("y")
print(holder)
acct = Account("New", 0)
print(bank.primary.owner, acct.owner, everyone[0] is acct)
