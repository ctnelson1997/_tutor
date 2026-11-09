import java.util.*;
import java.util.stream.*;

// #69: sorts call the comparator and compareTo exactly as Java's TimSort
// does, so a comparator that prints or counts shows Java's calls.
public class Main {
    static int calls = 0;
    static int hash = 17;

    static class Card implements Comparable<Card> {
        final int rank;
        Card(int rank) { this.rank = rank; }
        public int compareTo(Card o) {
            System.out.println("compareTo " + rank + " " + o.rank);
            return Integer.compare(rank, o.rank);
        }
        public String toString() { return "C" + rank; }
    }

    public static void main(String[] args) {
        List<Integer> list = new ArrayList<>(List.of(5, 4, 3, 2, 1));
        list.sort((a, b) -> {
            System.out.println("compare " + a + " " + b);
            return a - b;
        });
        System.out.println(list);

        List<Card> hand = new ArrayList<>(List.of(new Card(9), new Card(2), new Card(7), new Card(2), new Card(5)));
        Collections.sort(hand);
        System.out.println(hand);

        System.out.println(Stream.of("pear", "fig", "apple", "kiwi").sorted((x, y) -> {
            System.out.println("sorted " + x + " " + y);
            return x.length() - y.length();
        }).collect(Collectors.toList()));

        // 40 elements: two runs of 20, merged (galloping included).
        Integer[] data = new Integer[40];
        int x = 7;
        for (int i = 0; i < data.length; i++) {
            x = (x * 1103515245 + 12345) & 0x7fffffff;
            data[i] = i < 20 ? x % 50 : 100 + x % 50;
        }
        Arrays.sort(data, (a, b) -> {
            calls++;
            hash = hash * 31 + a * 7 + b;
            return Integer.compare(a, b);
        });
        System.out.println(calls + " comparisons, " + hash + ", " + data[0] + ".." + data[39]);
    }
}
