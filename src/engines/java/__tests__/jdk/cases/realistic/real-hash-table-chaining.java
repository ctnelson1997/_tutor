import java.util.LinkedList;
public class Main {
  static class Entry {
    String key; int value;
    Entry(String k, int v) { key = k; value = v; }
  }
  static class HashTable {
    private LinkedList<Entry>[] buckets;
    private int size;
    @SuppressWarnings("unchecked")
    HashTable(int cap) {
      buckets = new LinkedList[cap];
      for (int i = 0; i < cap; i++) buckets[i] = new LinkedList<>();
    }
    private int indexFor(String key) {
      return Math.abs(key.hashCode()) % buckets.length;
    }
    void put(String key, int value) {
      for (Entry e : buckets[indexFor(key)]) {
        if (e.key.equals(key)) { e.value = value; return; }
      }
      buckets[indexFor(key)].add(new Entry(key, value));
      size++;
    }
    Integer get(String key) {
      for (Entry e : buckets[indexFor(key)]) if (e.key.equals(key)) return e.value;
      return null;
    }
  }
  public static void main(String[] args) {
    HashTable t = new HashTable(5);
    t.put("one", 1); t.put("two", 2); t.put("three", 3); t.put("two", 22);
    System.out.println(t.get("two") + " " + t.get("four") + " size=" + t.size);
  }
}
