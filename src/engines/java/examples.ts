import type { CodeExample } from '../../types/engine';

export const examples: CodeExample[] = [
  {
    title: 'Variables & Types',
    slug: 'variables-types',
    category: 'Basics',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    int x = 42;
    double pi = 3.14;
    boolean flag = true;
    String name = "hello";
    System.out.println(x);
    System.out.println(name);
  }
}`,
  },
  {
    title: 'For Loop',
    slug: 'for-loop',
    category: 'Basics',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    int sum = 0;
    for (int i = 1; i <= 5; i++) {
      sum += i;
    }
    System.out.println("Sum: " + sum);
  }
}`,
  },
  {
    title: 'While Loop',
    slug: 'while-loop',
    category: 'Basics',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    int n = 1;
    while (n < 100) {
      n = n * 2;
    }
    System.out.println(n);
  }
}`,
  },
  {
    title: 'Conditionals',
    slug: 'conditionals',
    category: 'Basics',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    int age = 20;
    String category;
    if (age < 13) {
      category = "child";
    } else if (age < 18) {
      category = "teenager";
    } else {
      category = "adult";
    }
    System.out.println(category);
  }
}`,
  },
  {
    title: 'Do-While & Switch',
    slug: 'do-while-switch',
    category: 'Basics',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    int day = 3;
    String name;
    switch (day) {
      case 1: name = "Monday"; break;
      case 2: name = "Tuesday"; break;
      case 3: name = "Wednesday"; break;
      default: name = "Other"; break;
    }
    System.out.println(name);

    int count = 0;
    do {
      count++;
    } while (count < 3);
    System.out.println("Count: " + count);
  }
}`,
  },
  {
    title: 'Arrays',
    slug: 'arrays',
    category: 'Built-in Types',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    int[] nums = {10, 20, 30, 40, 50};
    int sum = 0;
    for (int i = 0; i < nums.length; i++) {
      sum += nums[i];
    }
    System.out.println("Sum: " + sum);
  }
}`,
  },
  {
    title: 'String Methods',
    slug: 'string-methods',
    category: 'Built-in Types',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    String text = "Hello, World!";
    int len = text.length();
    char first = text.charAt(0);
    String upper = text.toUpperCase();
    String sub = text.substring(0, 5);
    System.out.println(len);
    System.out.println(first);
    System.out.println(upper);
    System.out.println(sub);
  }
}`,
  },
  {
    title: '2D Array',
    slug: '2d-array',
    category: 'Built-in Types',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    int[][] grid = {{1, 2, 3}, {4, 5, 6}};
    int total = 0;
    for (int r = 0; r < grid.length; r++) {
      for (int c = 0; c < grid[r].length; c++) {
        total += grid[r][c];
      }
    }
    System.out.println("Total: " + total);
  }
}`,
  },
  {
    title: 'Static Methods',
    slug: 'static-methods',
    category: 'Methods',
    language: 'java',
    code: `public class Main {
  public static int add(int a, int b) {
    int result = a + b;
    return result;
  }

  public static void main(String[] args) {
    int sum = add(3, 4);
    System.out.println("3 + 4 = " + sum);
  }
}`,
  },
  {
    title: 'Recursion (Factorial)',
    slug: 'recursion-factorial',
    category: 'Methods',
    language: 'java',
    code: `public class Main {
  public static int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
  }

  public static void main(String[] args) {
    int result = factorial(5);
    System.out.println("5! = " + result);
  }
}`,
  },
  {
    title: 'Classes & Objects',
    slug: 'classes-objects',
    category: 'OOP',
    language: 'java',
    code: `public class Main {
  int age;
  String name;

  public Main(String name, int age) {
    this.name = name;
    this.age = age;
  }

  public void printInfo() {
    System.out.println(this.name + " is " + this.age);
  }

  public static void main(String[] args) {
    Main m = new Main("Rex", 5);
    m.printInfo();
  }
}`,
  },
  {
    title: 'List',
    slug: 'list',
    category: 'Data Structures',
    language: 'java',
    code: `public class Main {
  static class IntList {
    private int[] data;
    private int size;

    public IntList(int capacity) {
      data = new int[capacity];
      size = 0;
    }

    public void add(int value) {
      data[size] = value;
      size++;
    }

    public int get(int index) {
      return data[index];
    }

    public int size() {
      return size;
    }
  }

  public static void main(String[] args) {
    IntList list = new IntList(5);
    list.add(10);
    list.add(20);
    list.add(30);
    System.out.println(list.get(1));
    System.out.println(list.size());
  }
}`,
  },
  {
    title: 'Linked List',
    slug: 'linked-list',
    category: 'Data Structures',
    language: 'java',
    code: `public class Main {
  static class Node {
    int value;
    Node next;

    public Node(int value) {
      this.value = value;
    }
  }

  static class LinkedList {
    private Node head;
    private Node tail;

    public void append(int value) {
      Node node = new Node(value);
      if (head == null) {
        head = node;
        tail = node;
      } else {
        tail.next = node;
        tail = node;
      }
    }

    public int sum() {
      int total = 0;
      Node current = head;
      while (current != null) {
        total += current.value;
        current = current.next;
      }
      return total;
    }
  }

  public static void main(String[] args) {
    LinkedList list = new LinkedList();
    list.append(10);
    list.append(20);
    list.append(30);
    System.out.println(list.sum());
  }
}`,
  },
  {
    title: 'Stack',
    slug: 'stack',
    category: 'Data Structures',
    language: 'java',
    code: `public class Main {
  static class IntStack {
    private int[] data;
    private int top;

    public IntStack(int capacity) {
      data = new int[capacity];
      top = 0;
    }

    public void push(int value) {
      data[top] = value;
      top++;
    }

    public int pop() {
      top--;
      int value = data[top];
      data[top] = 0;
      return value;
    }
  }

  public static void main(String[] args) {
    IntStack stack = new IntStack(5);
    stack.push(10);
    stack.push(20);
    stack.push(30);
    System.out.println(stack.pop());
    System.out.println(stack.pop());
  }
}`,
  },
  {
    title: 'Queue',
    slug: 'queue',
    category: 'Data Structures',
    language: 'java',
    code: `public class Main {
  static class IntQueue {
    private int[] data;
    private int head;
    private int tail;
    private int size;

    public IntQueue(int capacity) {
      data = new int[capacity];
      head = 0;
      tail = 0;
      size = 0;
    }

    public void enqueue(int value) {
      data[tail] = value;
      tail = (tail + 1) % data.length;
      size++;
    }

    public int dequeue() {
      int value = data[head];
      data[head] = 0;
      head = (head + 1) % data.length;
      size--;
      return value;
    }
  }

  public static void main(String[] args) {
    IntQueue queue = new IntQueue(5);
    queue.enqueue(10);
    queue.enqueue(20);
    queue.enqueue(30);
    System.out.println(queue.dequeue());
    System.out.println(queue.dequeue());
  }
}`,
  },
  {
    title: 'Priority Queue',
    slug: 'priority-queue',
    category: 'Data Structures',
    language: 'java',
    code: `public class Main {
  static class IntPriorityQueue {
    private int[] heap;
    private int size;

    public IntPriorityQueue(int capacity) {
      heap = new int[capacity];
      size = 0;
    }

    public void offer(int value) {
      heap[size] = value;
      siftUp(size);
      size++;
    }

    public int poll() {
      int answer = heap[0];
      size--;
      heap[0] = heap[size];
      heap[size] = 0;
      siftDown(0);
      return answer;
    }

    private void siftUp(int index) {
      while (index > 0) {
        int parent = (index - 1) / 2;
        if (heap[parent] >= heap[index]) return;
        swap(parent, index);
        index = parent;
      }
    }

    private void siftDown(int index) {
      while (index * 2 + 1 < size) {
        int left = index * 2 + 1;
        int right = left + 1;
        int best = left;
        if (right < size && heap[right] > heap[left]) {
          best = right;
        }
        if (heap[index] >= heap[best]) return;
        swap(index, best);
        index = best;
      }
    }

    private void swap(int i, int j) {
      int temp = heap[i];
      heap[i] = heap[j];
      heap[j] = temp;
    }
  }

  public static void main(String[] args) {
    IntPriorityQueue queue = new IntPriorityQueue(6);
    queue.offer(25);
    queue.offer(10);
    queue.offer(40);
    queue.offer(15);
    System.out.println(queue.poll());
    System.out.println(queue.poll());
  }
}`,
  },
  {
    title: 'Binary Search Tree',
    slug: 'binary-search-tree',
    category: 'Data Structures',
    language: 'java',
    code: `public class Main {
  static class Node {
    int value;
    Node left;
    Node right;

    public Node(int value) {
      this.value = value;
    }
  }

  static class BinarySearchTree {
    private Node root;

    public void insert(int value) {
      root = insert(root, value);
    }

    private Node insert(Node node, int value) {
      if (node == null) {
        return new Node(value);
      }
      if (value < node.value) {
        node.left = insert(node.left, value);
      } else {
        node.right = insert(node.right, value);
      }
      return node;
    }

    public boolean contains(int value) {
      return contains(root, value);
    }

    private boolean contains(Node node, int value) {
      if (node == null) return false;
      if (value == node.value) return true;
      if (value < node.value) return contains(node.left, value);
      return contains(node.right, value);
    }
  }

  public static void main(String[] args) {
    BinarySearchTree tree = new BinarySearchTree();
    tree.insert(30);
    tree.insert(20);
    tree.insert(40);
    tree.insert(35);
    System.out.println(tree.contains(35));
    System.out.println(tree.contains(25));
  }
}`,
  },
  {
    title: 'Segment Tree',
    slug: 'segment-tree',
    category: 'Data Structures',
    language: 'java',
    code: `public class Main {
  static class SegmentTree {
    private int[] tree;
    private int n;

    public SegmentTree(int[] arr) {
      n = arr.length;
      tree = new int[4 * n];
      build(arr, 1, 0, n - 1);
    }

    private void build(int[] arr, int node, int left, int right) {
      if (left == right) {
        tree[node] = arr[left];
        return;
      }

      int mid = left + (right - left) / 2;

      build(arr, node * 2, left, mid);
      build(arr, node * 2 + 1, mid + 1, right);

      tree[node] = Math.max(tree[node * 2], tree[node * 2 + 1]);
    }

    public int queryMax(int queryLeft, int queryRight) {
      return queryMax(1, 0, n - 1, queryLeft, queryRight);
    }

    private int queryMax(int node, int left, int right, int queryLeft, int queryRight) {
      if (queryLeft <= left && right <= queryRight) {
        return tree[node];
      }

      int mid = left + (right - left) / 2;
      int answer = Integer.MIN_VALUE;

      if (queryLeft <= mid) {
        answer = Math.max(
          answer,
          queryMax(node * 2, left, mid, queryLeft, queryRight)
        );
      }

      if (queryRight > mid) {
        answer = Math.max(
          answer,
          queryMax(node * 2 + 1, mid + 1, right, queryLeft, queryRight)
        );
      }

      return answer;
    }
  }

  public static void main(String[] args) {
    int[] arr = {20, 15, 17, 35, 25, 40};

    SegmentTree segmentTree = new SegmentTree(arr);

    System.out.println(segmentTree.queryMax(0, 5));
    System.out.println(segmentTree.queryMax(2, 4));
    System.out.println(segmentTree.queryMax(1, 2));
  }
}`,
  },
];
