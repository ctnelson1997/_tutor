# Tracks a store inventory in a dictionary: sales, restocks, low-stock alerts and total value
inventory = {
    "apple": {"qty": 40, "price": 0.50},
    "bread": {"qty": 8, "price": 2.75},
    "milk": {"qty": 12, "price": 3.20},
    "eggs": {"qty": 5, "price": 4.10},
}


def sell(item, amount):
    if item not in inventory:
        return f"no such item: {item}"
    stock = inventory[item]
    if stock["qty"] < amount:
        return f"only {stock['qty']} {item} left"
    stock["qty"] -= amount
    return f"sold {amount} {item} for ${amount * stock['price']:.2f}"


def restock(item, amount, price=None):
    if item not in inventory:
        inventory[item] = {"qty": 0, "price": price or 1.0}
    inventory[item]["qty"] += amount
    if price is not None:
        inventory[item]["price"] = price


def low_stock(threshold=6):
    return sorted(name for name, info in inventory.items() if info["qty"] <= threshold)


orders = [("apple", 15), ("eggs", 3), ("milk", 20), ("cheese", 1), ("bread", 8)]
for item, amount in orders:
    print(sell(item, amount))

print("Low stock:", low_stock())
restock("bread", 12)
restock("cheese", 6, price=5.25)
print("After restock:", low_stock())

value = 0
for name, info in inventory.items():
    value += info["qty"] * info["price"]
print(f"Inventory value: ${value:.2f}")
print("Items:", list(inventory))
print("Cheese:", inventory["cheese"])
