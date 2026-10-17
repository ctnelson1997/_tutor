import java.util.Arrays;
public class Main {
  static class Book implements Comparable<Book> {
    String title; int year;
    Book(String t, int y) { title = t; year = y; }
    public int compareTo(Book other) { return Integer.compare(year, other.year); }
    public String toString() { return title + "(" + year + ")"; }
  }
  public static void main(String[] args) {
    Book[] books = { new Book("C", 2001), new Book("A", 1999), new Book("B", 2010) };
    Arrays.sort(books);
    System.out.println(Arrays.toString(books));
  }
}
