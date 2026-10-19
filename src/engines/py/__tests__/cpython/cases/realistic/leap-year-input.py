# Reads years one per line until end of input (EOFError) and classifies each as leap or not
def is_leap(year):
    if year % 400 == 0:
        return True
    if year % 100 == 0:
        return False
    return year % 4 == 0


def days_in_february(year):
    return 29 if is_leap(year) else 28


leap_years = []
common_years = []
while True:
    try:
        line = input()
    except EOFError:
        break
    line = line.strip()
    if not line:
        continue
    year = int(line)
    if is_leap(year):
        leap_years.append(year)
    else:
        common_years.append(year)
    print(f"{year}: {'leap' if is_leap(year) else 'common'} year, February has {days_in_february(year)} days")

print("Leap years:", leap_years)
print("Common years:", common_years)
next_leap = max(leap_years + common_years) + 1
while not is_leap(next_leap):
    next_leap += 1
print("Next leap year after the largest input:", next_leap)
