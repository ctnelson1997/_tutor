import java.util.*;
public class Main {
  public static void main(String[] args) {
    System.out.println("apple".compareTo("cherry") + " " + "abc".compareTo("abcde") + " " + "b".compareTo("a") + " " + "Hello".compareToIgnoreCase("hellO") + " " + "abc".compareToIgnoreCase("ABD"));
    char[] cs = {'o', 'e', 'l', 'l', 'h'};
    System.out.println(new String(cs) + " " + String.valueOf(cs) + " " + new String(cs, 1, 3) + " " + new String() .length() + " " + new String("x") + " " + new String(new StringBuilder("sb")));
    System.out.println(Arrays.toString("the   quick  brown fox".split("\\s+")) + " " + "a,b,,".split(",").length + " " + Arrays.toString("a,b,,".split(",", -1)) + " " + Arrays.toString("a,b,c,d".split(",", 2)) + " " + Arrays.toString("".split(",")) + " " + Arrays.toString(",a,b".split(",")) + " " + Arrays.toString("abc".split("")) + " " + Arrays.toString("a.b.c".split("\\.")) + " " + Arrays.toString("x1y22z".split("[0-9]+")) + " " + Arrays.toString("a|b".split("\\|")));
    try { "abc".charAt(5); } catch (Exception e) { System.out.println(e); }
    try { "abc".substring(2, 1); } catch (Exception e) { System.out.println(e); }
    try { "abc".substring(5); } catch (Exception e) { System.out.println(e); }
    try { "abc".charAt(-1); } catch (Exception e) { System.out.println(e); }
    String hi = "hi";
    String built = new StringBuilder("hi").toString();
    Scanner in = new Scanner("yes");
    String answer = in.next();
    String concat = "h" + "i";
    String part = "h";
    String runtime = part + "i";
    System.out.println(hi.equals(new String("hi")) + " " + (hi == new String("hi")) + " " + (hi == built) + " " + (hi == "hi") + " " + (answer == "yes") + " " + answer.equals("yes") + " " + (hi == concat) + " " + (hi == runtime) + " " + (hi == runtime.intern()) + " " + (hi == hi.trim()) + " " + (hi == hi.toLowerCase()) + " " + (hi == hi.toUpperCase()) + " " + (hi == hi.replace('z', 'q')) + " " + (hi == hi.substring(0)) + " " + (hi == hi.concat("")) + " " + hi.equals(5));
    System.out.println("hello".hashCode() + " " + "".hashCode() + " " + "Hello, World! 123".hashCode());
    StringBuilder sb = new StringBuilder("hello world");
    sb.setCharAt(0, 'H'); sb.delete(5, 11); sb.append('!').insert(0, 42).insert(2, ' ').replace(3, 8, "HEY");
    System.out.println(sb + " " + sb.indexOf("E") + " " + sb.lastIndexOf("!") + " " + sb.length() + " " + sb.charAt(1));
    try { sb.charAt(99); } catch (Exception e) { System.out.println(e); }
    try { sb.deleteCharAt(99); } catch (Exception e) { System.out.println(e); }
    try { sb.insert(99, "x"); } catch (Exception e) { System.out.println(e); }
    Integer x = 5; Integer y = 7; Double z = 2.9; Long big = 3L; Character c = 'q'; Boolean b = true;
    System.out.println(x.compareTo(y) + " " + x.equals(5) + " " + x.equals(5L) + " " + z.intValue() + " " + x.doubleValue() + " " + big.intValue() + " " + c.charValue() + " " + b.booleanValue() + " " + x.hashCode() + " " + z.hashCode() + " " + big.hashCode() + " " + x.toString() + " " + z.compareTo(3.0) + " " + c.compareTo('a') + " " + b.compareTo(false) + " " + Integer.hashCode(9) + " " + Double.hashCode(1.5) + " " + Boolean.hashCode(true) + " " + Character.hashCode('a'));
    System.out.println("a1b22c".replaceAll("[0-9]+", "#") + " " + "John Smith".replaceAll("(\\w+) (\\w+)", "$2, $1") + " " + "price".replaceAll("e", "\\$") + " " + "aaa".replaceFirst("a", "b") + " " + "2026-10-11".matches("\\d{4}-\\d{2}-\\d{2}") + " " + "abc".matches("ab") + " " + "Hello".replaceAll("(?i)h", "J") + " " + "a.b".replace(".", "\\") + " " + "tab\there".replaceAll("\\s", "_"));
    System.out.println("banana".lastIndexOf("an", 2) + " " + "banana".indexOf('n') + " " + "banana".indexOf('n', 3) + " " + "banana".lastIndexOf('a') + " " + "banana".startsWith("na", 2) + " " + " x ".strip() + "|" + "ab".repeat(3) + " " + "abc".contains(""));
  }
}
