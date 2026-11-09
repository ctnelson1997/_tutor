public class Main {
    enum Color { RED, GREEN, BLUE }
    public static void main(String[] args) {
        Color c = Color.RED;
        int n = switch (c) { case RED -> 1; case GREEN -> 2; };
        System.out.println(n);
    }
}
