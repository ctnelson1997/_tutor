public class Main {
    public static void main(String[] args) {
        int n = 2;
        String s = switch (n) { case 1 -> "one"; case 2 -> "two"; };
        System.out.println(s);
    }
}
