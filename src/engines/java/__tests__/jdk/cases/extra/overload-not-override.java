import java.util.*;

// #62: the library calls equals(Object) and Comparable.compareTo. A class that
// only overloads equals, or has a compareTo without implementing Comparable,
// gets Object's identity equals and no natural order.
public class Main {
    static class Point {
        int x, y;
        Point(int x, int y) { this.x = x; this.y = y; }
        // An overload, not an override: the parameter isn't Object.
        public boolean equals(Point other) { return x == other.x && y == other.y; }
        public int hashCode() { return 31 * x + y; }
    }

    static class Fixed {
        int x;
        Fixed(int x) { this.x = x; }
        @Override public boolean equals(Object o) { return o instanceof Fixed f && f.x == x; }
        @Override public int hashCode() { return x; }
    }

    static class Student {
        String name; int score;
        Student(String name, int score) { this.name = name; this.score = score; }
        // No "implements Comparable<Student>".
        public int compareTo(Student o) { return score - o.score; }
        public String toString() { return name + ":" + score; }
    }

    static class Ranked implements Comparable<Ranked> {
        int score;
        Ranked(int score) { this.score = score; }
        public int compareTo(Ranked o) { return Integer.compare(score, o.score); }
        public String toString() { return "R" + score; }
    }

    record Pair(int a, int b) {}

    public static void main(String[] args) {
        Point a = new Point(1, 2), b = new Point(1, 2);
        System.out.println("direct: " + a.equals(b));
        Object o = b;
        System.out.println("through Object: " + a.equals(o));
        List<Point> points = new ArrayList<>();
        points.add(a);
        System.out.println("contains: " + points.contains(b) + ", indexOf: " + points.indexOf(b));
        System.out.println("Objects.equals: " + Objects.equals(a, b));
        Set<Point> set = new HashSet<>(List.of(a));
        System.out.println("HashSet contains: " + set.contains(b) + ", add: " + set.add(b) + ", size: " + set.size());

        Set<Fixed> fixed = new HashSet<>();
        fixed.add(new Fixed(3));
        System.out.println("overridden: " + fixed.contains(new Fixed(3)) + " " + List.of(new Fixed(4)).indexOf(new Fixed(4)));
        System.out.println("record: " + new HashSet<>(List.of(new Pair(1, 2))).contains(new Pair(1, 2)));

        List<Ranked> ranked = new ArrayList<>(List.of(new Ranked(3), new Ranked(1), new Ranked(2)));
        Collections.sort(ranked);
        System.out.println("sorted: " + ranked + ", max: " + Collections.max(ranked) + ", tree: " + new TreeSet<>(ranked));

        Student[] one = { new Student("Ann", 90) };
        Arrays.sort(one);
        System.out.println("one student sorts: " + Arrays.toString(one));
        try {
            new TreeSet<Student>().add(new Student("Bob", 80));
        } catch (ClassCastException e) {
            System.out.println("TreeSet: ClassCastException");
        }
        try {
            new PriorityQueue<Student>(List.of(new Student("Cy", 1), new Student("Di", 2)));
        } catch (ClassCastException e) {
            System.out.println("PriorityQueue: ClassCastException");
        }
        Student[] students = { new Student("Eve", 70), new Student("Fay", 95) };
        Arrays.sort(students);
        System.out.println("not reached");
    }
}
