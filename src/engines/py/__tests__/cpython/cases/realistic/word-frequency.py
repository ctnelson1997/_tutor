# Counts word frequencies in a short passage and lists the most common words
text = """The quick brown fox jumps over the lazy dog.
The dog sleeps, and the fox runs away! A quick fox is a happy fox."""

counts = {}
for raw in text.split():
    word = raw.strip(".,!?").lower()
    if word in counts:
        counts[word] += 1
    else:
        counts[word] = 1

print("Distinct words:", len(counts))
print("Total words:", sum(counts.values()))

ordered = sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))
print("Top 5:")
for word, n in ordered[:5]:
    print(f"  {word:<6} {'*' * n} ({n})")

singletons = [w for w, n in counts.items() if n == 1]
singletons.sort()
print("Appear once:", singletons)

by_letter = {}
for word in counts:
    first = word[0]
    by_letter.setdefault(first, []).append(word)
for letter in sorted(by_letter):
    by_letter[letter].sort()
print("Words starting with 'f':", by_letter["f"])
print("Words starting with 't':", by_letter["t"])
longest = max(counts, key=len)
print("Longest word:", longest)
