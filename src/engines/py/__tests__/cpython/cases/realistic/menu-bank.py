# Menu-driven account: reads commands like "d 50" or "w 20" until q, with error handling
balance = 0.0
log = []


def apply(command, amount):
    global balance
    if command == "d":
        balance += amount
    elif command == "w":
        if amount > balance:
            raise ValueError(f"insufficient funds (balance {balance:.2f})")
        balance -= amount
    log.append((command, amount, balance))


print("Commands: d <amount>, w <amount>, b, q")
while True:
    parts = input("> ").split()
    if not parts:
        continue
    cmd = parts[0].lower()
    if cmd == "q":
        print("Goodbye")
        break
    if cmd == "b":
        print(f"Balance: ${balance:.2f}")
        continue
    if cmd not in ("d", "w") or len(parts) != 2:
        print("Unknown command:", " ".join(parts))
        continue
    try:
        amount = float(parts[1])
        if amount <= 0:
            raise ValueError("amount must be positive")
        apply(cmd, amount)
        print(f"OK, balance ${balance:.2f}")
    except ValueError as err:
        print("Error:", err)

print("Transactions:", len(log))
for command, amount, after in log:
    kind = "deposit" if command == "d" else "withdrawal"
    print(f"  {kind:<10} {amount:>8.2f} -> {after:>8.2f}")
