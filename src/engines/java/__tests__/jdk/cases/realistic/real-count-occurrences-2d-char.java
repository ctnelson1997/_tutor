public class Main {
  public static void main(String[] args) {
    String[] words = {"apple", "banana", "cherry"};
    int[] counts = new int[26];
    for (String w : words)
      for (char c : w.toCharArray())
        counts[c - 'a']++;
    for (int i = 0; i < 26; i++)
      if (counts[i] > 1) System.out.print((char) ('a' + i) + "=" + counts[i] + " ");
    System.out.println();
  }
}
