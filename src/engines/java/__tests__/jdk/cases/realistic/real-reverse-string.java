public class Main {
  public static String reverse(String s) {
    String result = "";
    for (int i = s.length() - 1; i >= 0; i--) {
      result += s.charAt(i);
    }
    return result;
  }
  public static void main(String[] args) {
    String word = "stressed";
    System.out.println(reverse(word));
    StringBuilder sb = new StringBuilder(word);
    System.out.println(sb.reverse().toString());
  }
}
