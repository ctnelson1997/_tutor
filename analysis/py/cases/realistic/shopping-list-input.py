# Builds a shopping list from "item quantity" lines until done, merging repeated items
shopping = {}
order = []

item_line = input("Item and quantity (done to finish): ").strip()
while item_line.lower() != "done":
    pieces = item_line.rsplit(" ", 1)
    if len(pieces) == 2 and pieces[1].isdigit():
        item, qty = pieces[0].lower(), int(pieces[1])
    else:
        item, qty = item_line.lower(), 1
    if item not in shopping:
        order.append(item)
        shopping[item] = 0
    shopping[item] += qty
    item_line = input("Item and quantity (done to finish): ").strip()

print()
print("Shopping list:")
for number, item in enumerate(order, start=1):
    print(f"{number}. {item} x{shopping[item]}")

total_items = sum(shopping.values())
print("Total items:", total_items)
alphabetical = sorted(shopping)
print("Alphabetical:", alphabetical)
bulk = {item: qty for item, qty in shopping.items() if qty >= 3}
print("Buy in bulk:", bulk)
