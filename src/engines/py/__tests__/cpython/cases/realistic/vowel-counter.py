# Counts vowels and consonants in words and finds the word with the most vowels
VOWELS = "aeiou"


def count_vowels(word):
    count = 0
    for ch in word.lower():
        if ch in VOWELS:
            count += 1
    return count


def vowel_breakdown(word):
    breakdown = {}
    for ch in word.lower():
        if ch in VOWELS:
            breakdown[ch] = breakdown.get(ch, 0) + 1
    return breakdown


words = ["Education", "rhythm", "Banana", "queue", "Python", "sky"]
summary = []
for w in words:
    v = count_vowels(w)
    letters = sum(1 for ch in w if ch.isalpha())
    summary.append((w, v, letters - v))
    print(f"{w:<10} vowels={v} consonants={letters - v}")

most = summary[0]
for entry in summary:
    if entry[1] > most[1]:
        most = entry
print("Most vowels:", most[0])

no_vowels = [w for w, v, c in summary if v == 0]
print("No vowels:", no_vowels)

print("Breakdown of 'Education':", vowel_breakdown("Education"))
print("Breakdown of 'queue':", vowel_breakdown("queue"))
total_vowels = sum(v for _, v, _ in summary)
print("Total vowels:", total_vowels)
