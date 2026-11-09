import java.util.*;

// #65: parsing and Scanner's validation as Java does them: a string that
// isn't a number is a NumberFormatException, and a token that doesn't match
// stays unread for the next call.
public class Main {
    public static void main(String[] args) {
        double total = 0;
        int bad = 0;
        for (String s : new String[] { "12.5", "ten", "7.25", "3,5", "", " 4 ", "3.5abc", "1_000", "0x10", "2.5f", "-1e2", "infinity" }) {
            try {
                total += Double.parseDouble(s);
            } catch (NumberFormatException e) {
                bad++;
                System.out.println("rejected: " + e.getMessage());
            }
        }
        System.out.println(total + " " + bad);
        try {
            Float.parseFloat("2.5x");
        } catch (NumberFormatException e) {
            System.out.println("float: " + e.getMessage());
        }
        System.out.println(Double.valueOf("6.25") + " " + Float.valueOf("1.5") + " " + Double.parseDouble("-NaN") + " " + Double.parseDouble("+Infinity") + " " + Double.parseDouble("0x1.8p1"));

        Scanner sc = new Scanner(System.in);
        // Line 1: numbers mixed with words, read by a Scanner over the line.
        Scanner line = new Scanner(sc.nextLine());
        double sum = 0;
        int skipped = 0;
        while (line.hasNext()) {
            if (line.hasNextDouble()) sum += line.nextDouble();
            else {
                System.out.println("skip " + line.next());
                skipped++;
            }
        }
        System.out.println("sum=" + sum + " skipped=" + skipped);

        // Line 2: a token nextDouble() refuses stays unread.
        try {
            sc.nextDouble();
        } catch (InputMismatchException e) {
            System.out.println("mismatch, still there: " + sc.next());
        }
        // A boolean must be true or false.
        try {
            sc.nextBoolean();
        } catch (InputMismatchException e) {
            System.out.println("not a boolean: " + sc.next());
        }
        System.out.println(sc.nextBoolean() + " " + sc.nextBoolean());
        // An int too big for an int is a long.
        System.out.println(sc.hasNextInt() + " " + sc.hasNextLong() + " " + sc.nextLong());
        try {
            sc.nextInt();
        } catch (InputMismatchException e) {
            System.out.println("too big: " + e.getMessage() + ", " + sc.next());
        }
        // Thousands separators, as the US locale has them.
        System.out.println(sc.nextInt() + " " + sc.nextDouble());
        sc.nextLine();
        System.out.println("last line: " + sc.nextLine());
        try {
            sc.nextLine();
        } catch (NoSuchElementException e) {
            System.out.println("end: " + e.getMessage());
        }
        sc.close();
        try {
            sc.hasNext();
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage());
        }
    }
}
