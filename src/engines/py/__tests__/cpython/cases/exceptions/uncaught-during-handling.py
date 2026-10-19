# ends uncaught: an exception raised while handling another, so the traceback shows both
def lookup(table, key):
    try:
        return table[key]
    except KeyError:
        return table["default"] + 1

prices = {"default": "n/a", "apple": 3}
print(lookup(prices, "apple"))
print(lookup(prices, "pear"))
