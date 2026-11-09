import java.util.*;
import java.util.stream.*;

// #63: library methods with a varargs parameter receive their arguments as
// one array (or the array the call passes), and use its elements.
public class Main {
    static class Point {
        final int x, y;
        Point(int x, int y) { this.x = x; this.y = y; }
        @Override public boolean equals(Object o) { return o instanceof Point p && p.x == x && p.y == y; }
        @Override public int hashCode() { return Objects.hash(x, y); }
        @Override public String toString() { return "(" + x + ", " + y + ")"; }
    }

    public static void main(String[] args) {
        Set<Point> visited = new HashSet<>();
        visited.add(new Point(1, 2));
        visited.add(new Point(1, 2));
        visited.add(new Point(2, 1));
        System.out.println(visited.size() + " " + visited.contains(new Point(2, 1)) + " " + new Point(1, 2).hashCode());

        Map<Point, Integer> counts = new HashMap<>();
        for (int[] p : new int[][] { {0, 0}, {3, 4}, {0, 0}, {0, 0} }) {
            Point key = new Point(p[0], p[1]);
            counts.put(key, counts.getOrDefault(key, 0) + 1);
        }
        System.out.println(counts.get(new Point(0, 0)) + " " + counts.get(new Point(3, 4)) + " " + counts.size());

        System.out.println(Objects.hash(1, 2) + " " + Objects.hash() + " " + Objects.hash("a", null, 2.5) + " " + Objects.hash((Object[]) null));
        Object[] boxed = { 1, 2 };
        System.out.println(Objects.hash(boxed));

        List<Integer> nums = new ArrayList<>();
        System.out.println(Collections.addAll(nums, 3, 1, 2) + " " + nums);
        String[] words = { "x", "y" };
        List<String> list = new ArrayList<>();
        System.out.println(Collections.addAll(list, words) + " " + list + " " + Collections.addAll(list));
        Set<String> set = new TreeSet<>(list);
        System.out.println(Collections.addAll(set, "y", "z") + " " + set);

        // The other varargs methods, given values and given an array.
        System.out.println(String.format("%s-%s", "a", "b") + " " + String.format("%s+%s", (Object[]) words));
        System.out.println(String.join("/", "p", "q") + " " + String.join("/", words));
        System.out.println(List.of(4, 5) + " " + List.of(words) + " " + Set.of(words).size());
        List<String> backed = Arrays.asList(words);
        backed.set(0, "w");
        System.out.println(Arrays.asList(6, 7) + " " + backed + " " + words[0]);
        System.out.println(Stream.of(8, 9).count() + " " + Stream.of(words).collect(Collectors.joining(",")));
        System.out.println(IntStream.of(1, 2, 3).sum() + " " + IntStream.of(new int[] {4, 5}).sum() + " " + DoubleStream.of(0.5, 0.25).sum());
        System.out.printf("%d %d%n", 10, 20);
        System.out.println("%s/%s".formatted("m", "n"));
    }
}
