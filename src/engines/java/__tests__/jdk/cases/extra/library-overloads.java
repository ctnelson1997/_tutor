import java.util.*;
import java.util.stream.*;

// #71: library overloads intro courses use, which JavaTutor used to reject
// with javac-style errors on valid code.
public class Main {
    public static void main(String[] args) {
        // Character's int (code point) versions, and method references to them.
        System.out.println(Character.isLetter(97) + " " + Character.isUpperCase(65) + " " + Character.toUpperCase(97) + " " + Character.toString(65));
        String text = "Hello, World 42!";
        System.out.println(text.chars().filter(c -> Character.isLetter(c)).count() + " " + text.chars().filter(Character::isDigit).count());
        System.out.println(text.chars().map(Character::toUpperCase).mapToObj(c -> String.valueOf((char) c)).collect(Collectors.joining()));
        System.out.println(Character.isLetter('x') + " " + Character.toUpperCase('q') + " " + Character.valueOf('z'));

        // A die roll with Random.nextInt(origin, bound).
        Random dice = new Random(7);
        StringBuilder rolls = new StringBuilder();
        for (int i = 0; i < 8; i++) rolls.append(dice.nextInt(1, 7)).append(' ');
        System.out.println(rolls.toString().trim());

        List<String> names = new ArrayList<>(List.of("ann", "bob", "cy"));
        String[] array = names.toArray(String[]::new);
        System.out.println(array.length + " " + array[2]);
        int[] nums = { 1, 2, 3, 4, 5 };
        System.out.println(Arrays.stream(nums, 1, 4).sum());

        Optional<String> first = names.stream().filter(s -> s.startsWith("b")).findFirst();
        System.out.println(first.orElseThrow(() -> new IllegalStateException("no b")));
        try {
            names.stream().filter(s -> s.startsWith("z")).findFirst().orElseThrow(() -> new IllegalStateException("no z"));
        } catch (IllegalStateException e) {
            System.out.println("caught " + e.getMessage());
        }

        List<String> words = List.of("apple", "bob", "cat", "apple", "dog", "bob", "apple");
        System.out.println(words.stream().collect(Collectors.toMap(w -> w, w -> 1, Integer::sum)));
        TreeMap<String, Integer> sorted = words.stream().collect(Collectors.toMap(w -> w, w -> 1, Integer::sum, TreeMap::new));
        System.out.println(sorted);
        TreeMap<Integer, List<String>> byLength = words.stream().collect(Collectors.groupingBy(String::length, TreeMap::new, Collectors.toList()));
        System.out.println(byLength);
        System.out.println(Stream.iterate(1, n -> n <= 100, n -> n * 3).toList());
        System.out.println(words.stream().reduce(0, (acc, w) -> acc + w.length(), Integer::sum));

        Map<String, Integer> scores = new HashMap<>(Map.of("ann", 90, "bob", 72, "cy", 85));
        List<Map.Entry<String, Integer>> ranked = new ArrayList<>(scores.entrySet());
        ranked.sort(Map.Entry.comparingByValue(Comparator.reverseOrder()));
        System.out.println(ranked);
        ranked.sort(Map.Entry.comparingByKey(Comparator.reverseOrder()));
        System.out.println(ranked);

        StringTokenizer st = new StringTokenizer("to be, or not to be", " ,");
        System.out.print(st.countTokens() + ":");
        while (st.hasMoreTokens()) System.out.print(" " + st.nextToken());
        System.out.println();
        StringTokenizer withDelims = new StringTokenizer("a+b-c", "+-", true);
        while (withDelims.hasMoreElements()) System.out.print("[" + withDelims.nextElement() + "]");
        System.out.println();
        try {
            withDelims.nextToken();
        } catch (NoSuchElementException e) {
            System.out.println("no more tokens");
        }

        System.out.println(String.format(Locale.US, "%.2f", 3.14159) + " " + Locale.US);
        System.out.printf(Locale.US, "%,d%n", 1234567);
    }
}
