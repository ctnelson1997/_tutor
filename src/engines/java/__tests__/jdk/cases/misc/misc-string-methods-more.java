public class Main {
  public static void main(String[] args) {
    String s = "Hello World";
    System.out.println(s.indexOf('o') + " " + s.lastIndexOf('o') + " " + s.indexOf("o", 5));
    System.out.println(s.replace('l', 'L') + " " + s.contains("World") + " " + s.charAt(s.length() - 1));
    System.out.println(String.valueOf(3.0) + String.valueOf(true) + String.valueOf('c'));
    System.out.println(s.chars().filter(ch -> ch == 'l').count());
  }
}
