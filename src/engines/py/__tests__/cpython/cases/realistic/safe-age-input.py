# Keeps asking for a valid age, handling ValueError from int() and out-of-range values
def read_int(prompt, low, high):
    attempts = 0
    while True:
        attempts += 1
        text = input(prompt)
        try:
            value = int(text)
        except ValueError:
            print(f"  '{text}' is not a whole number, try again")
            continue
        if value < low or value > high:
            print(f"  {value} is out of range ({low}-{high})")
            continue
        return value, attempts


age, tries = read_int("Age: ", 0, 120)
print(f"Got age {age} after {tries} attempts")

if age >= 65:
    category = "senior"
elif age >= 18:
    category = "adult"
elif age >= 13:
    category = "teen"
else:
    category = "child"
print("Ticket category:", category)

prices = {"child": 6, "teen": 8, "adult": 12, "senior": 7}
count, tries = read_int("How many tickets? ", 1, 10)
cost = prices[category] * count
print(f"{count} {category} tickets cost ${cost}")
