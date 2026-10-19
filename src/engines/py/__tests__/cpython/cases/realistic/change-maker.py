# Reads purchase prices and payments as dollar amounts and makes change with the fewest coins and bills
DENOMINATIONS = [(2000, "$20"), (1000, "$10"), (500, "$5"), (100, "$1"),
                 (25, "quarter"), (10, "dime"), (5, "nickel"), (1, "penny")]


def to_cents(text):
    return round(float(text) * 100)


def make_change(cents):
    breakdown = []
    for value, name in DENOMINATIONS:
        count, cents = divmod(cents, value)
        if count:
            breakdown.append((name, count))
    return breakdown


transactions = int(input("Number of transactions: "))
summary = []
for t in range(transactions):
    try:
        price = to_cents(input("Price: "))
        paid = to_cents(input("Paid: "))
    except ValueError as e:
        print("  Bad amount:", e)
        continue
    if paid < price:
        print(f"  Short by ${(price - paid) / 100:.2f}")
        continue
    change = paid - price
    pieces = make_change(change)
    summary.append((change, pieces))
    print(f"  Change ${change / 100:.2f}: " + ", ".join(f"{n} x {name}" for name, n in pieces))

print("Completed", len(summary), "of", transactions, "transactions")
total_coins = sum(n for _, pieces in summary for _, n in pieces)
print("Coins and bills handed out:", total_coins)
