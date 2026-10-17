public class Main {
  public static int countVowels(String s) {
    int count = 0;
    for (int i = 0; i < s.length(); i++) {
      char c = Character.toLowerCase(s.charAt(i));
      if ("aeiou".indexOf(c) >= 0) count++;
    }
    return count;
  }
  public static String caesar(String s, int shift) {
    StringBuilder out = new StringBuilder();
    for (char c : s.toCharArray()) {
      if (Character.isUpperCase(c)) {
        out.append((char) ('A' + (c - 'A' + shift) % 26));
      } else if (Character.isLowerCase(c)) {
        out.append((char) ('a' + (c - 'a' + shift) % 26));
      } else {
        out.append(c);
      }
    }
    return out.toString();
  }
  public static void main(String[] args) {
    String msg = "Hello, World";
    System.out.println(countVowels(msg));
    System.out.println(caesar(msg, 3));
  }
}
