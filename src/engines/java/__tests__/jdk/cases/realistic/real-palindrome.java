public class Main {
  public static boolean isPalindrome(String s) {
    String clean = s.toLowerCase().replaceAll("[^a-z]", "");
    int left = 0;
    int right = clean.length() - 1;
    while (left < right) {
      if (clean.charAt(left) != clean.charAt(right)) {
        return false;
      }
      left++;
      right--;
    }
    return true;
  }

  public static void main(String[] args) {
    String[] tests = {"racecar", "A man, a plan, a canal: Panama", "hello"};
    for (String t : tests) {
      System.out.println("\"" + t + "\" -> " + isPalindrome(t));
    }
  }
}
