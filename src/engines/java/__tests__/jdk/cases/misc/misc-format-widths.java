public class Main {
  public static void main(String[] args) {
    System.out.println(String.format("|%5s|%-5s|%05d|%,d|", "ab", "cd", 42, 1234567));
    System.out.printf("%b %c %x %o%n", true, 'z', 255, 8);
    System.out.printf("%8.3f|%-8.2f|%n", 3.14159, 2.5);
  }
}
