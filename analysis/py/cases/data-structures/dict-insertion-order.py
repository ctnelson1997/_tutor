# Dict insertion order: updating keeps a key's place, del then re-add moves it last, popitem takes the last
stock = {}
stock["apple"] = 5
stock["banana"] = 2
stock["cherry"] = 7
print(stock)
stock["apple"] = 9
print(list(stock))
del stock["banana"]
stock["banana"] = 4
print(stock)
last = stock.popitem()
print(last, stock)
stock["date"] = 1
stock.update({"apple": 0, "elder": 3})
print(stock)
first_key = next(iter(stock))
print(first_key, list(reversed(stock)))
copy = dict(stock)
same_items = copy == {"elder": 3, "date": 1, "cherry": 7, "apple": 0}
print(same_items, list(copy.items()) == list(stock.items()))
rebuilt = {k: stock[k] for k in sorted(stock, key=stock.get)}
print(rebuilt, rebuilt == stock, list(rebuilt) == list(stock))
