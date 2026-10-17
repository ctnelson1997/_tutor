public class Main {
  public static void main(String[] args) {
    String line = "the   quick  brown fox";
    String[] words = line.split("\\s+");
    System.out.println(words.length);
    String csv = "a,b,,";
    System.out.println(csv.split(",").length);
  }
}
