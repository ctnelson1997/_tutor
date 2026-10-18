# Checks passwords read from input against strength rules until the user types quit
import string


def problems(password):
    issues = []
    if len(password) < 8:
        issues.append("too short")
    if not any(ch.isupper() for ch in password):
        issues.append("no uppercase letter")
    if not any(ch.isdigit() for ch in password):
        issues.append("no digit")
    if not any(ch in string.punctuation for ch in password):
        issues.append("no symbol")
    return issues


def strength(password, issues):
    score = 4 - len(issues)
    if len(password) >= 12:
        score += 1
    return ["very weak", "weak", "fair", "good", "strong", "excellent"][score]


results = []
while True:
    pw = input("Password (or quit): ")
    if pw == "quit":
        break
    found = problems(pw)
    rating = strength(pw, found)
    results.append((len(pw), rating))
    if found:
        print(f"  Rejected ({rating}): " + ", ".join(found))
    else:
        print(f"  Accepted ({rating})")

print()
accepted = [r for r in results if r[1] in ("strong", "excellent")]
print("Checked", len(results), "passwords;", len(accepted), "accepted")
print("Lengths and ratings:", results)
