public class Main {
  public static void main(String[] args) {
    String word = "banana";
    int[] freq = new int[26];
    for (int i = 0; i < word.length(); i++) {
      freq[word.charAt(i) - 'a']++;
    }
    System.out.println("a=" + freq[0] + " b=" + freq[1] + " n=" + freq[13]);
  }
}
