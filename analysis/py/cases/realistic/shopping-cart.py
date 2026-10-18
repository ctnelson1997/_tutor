# Builds a shopping cart of Item objects with quantities, a coupon, tax and a receipt
class Item:
    def __init__(self, name, price, category):
        self.name = name
        self.price = price
        self.category = category

    def __repr__(self):
        return f"Item({self.name!r}, {self.price})"


class Cart:
    TAX_RATE = 0.055

    def __init__(self):
        self.lines = {}

    def add(self, item, qty=1):
        old = self.lines.get(item.name, (item, 0))[1]
        self.lines[item.name] = (item, old + qty)

    def remove(self, name):
        item, qty = self.lines.pop(name)
        return qty

    def subtotal(self):
        return sum(item.price * qty for item, qty in self.lines.values())

    def discount(self, coupon):
        if coupon == "FOOD10":
            food = sum(i.price * q for i, q in self.lines.values() if i.category == "food")
            return round(food * 0.10, 2)
        return 0

    def receipt(self, coupon=None):
        for item, qty in self.lines.values():
            print(f"{item.name:<10}{qty:>3} x {item.price:>6.2f} = {item.price * qty:>7.2f}")
        sub = self.subtotal()
        off = self.discount(coupon)
        tax = round((sub - off) * Cart.TAX_RATE, 2)
        total = round(sub - off + tax, 2)
        print(f"Subtotal {sub:.2f}, discount {off:.2f}, tax {tax:.2f}, total {total:.2f}")
        return total


catalog = [Item("pasta", 1.99, "food"), Item("soap", 3.49, "home"), Item("cereal", 4.25, "food"), Item("towel", 8.00, "home")]
cart = Cart()
cart.add(catalog[0], 3)
cart.add(catalog[1])
cart.add(catalog[2], 2)
cart.add(catalog[0])
cart.add(catalog[3])
print("Removed towels:", cart.remove("towel"))
print("Cart:", cart.lines)
total = cart.receipt(coupon="FOOD10")
item_count = sum(qty for _, qty in cart.lines.values())
print("Items in cart:", item_count, "Total due:", total)
