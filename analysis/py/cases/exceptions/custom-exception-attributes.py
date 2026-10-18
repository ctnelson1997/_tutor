# Custom exception classes with extra attributes, a custom __str__, and a small hierarchy
class ShopError(Exception):
    pass

class OutOfStock(ShopError):
    def __init__(self, item, wanted, available):
        super().__init__(f"{item}: wanted {wanted}, only {available} left")
        self.item = item
        self.wanted = wanted
        self.available = available

class BadCoupon(ShopError):
    def __init__(self, code):
        self.code = code

    def __str__(self):
        return f"coupon {self.code!r} is invalid"

stock = {"pen": 3, "pad": 0}

def buy(item, qty, coupon=None):
    if coupon and not coupon.startswith("SAVE"):
        raise BadCoupon(coupon)
    if stock[item] < qty:
        raise OutOfStock(item, qty, stock[item])
    stock[item] -= qty
    return f"bought {qty} {item}"

for args in [("pen", 2), ("pen", 2), ("pad", 1, "FREE"), ("pad", 1, "SAVE10")]:
    try:
        print(buy(*args))
    except OutOfStock as e:
        print("OutOfStock:", e, "| short by", e.wanted - e.available)
    except ShopError as e:
        print(type(e).__name__ + ":", e, e.args)
print(stock)
