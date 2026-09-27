public class Main {
  static class TreeNode {
    int key;
    TreeNode left, right;
    TreeNode(int key) { this.key = key; }
  }
  static TreeNode insert(TreeNode root, int key) {
    if (root == null) return new TreeNode(key);
    if (key < root.key) root.left = insert(root.left, key);
    else root.right = insert(root.right, key);
    return root;
  }
  static void inorder(TreeNode node) {
    if (node == null) return;
    inorder(node.left);
    System.out.print(node.key + " ");
    inorder(node.right);
  }
  static int height(TreeNode node) {
    if (node == null) return 0;
    return 1 + Math.max(height(node.left), height(node.right));
  }
  public static void main(String[] args) {
    TreeNode root = null;
    int[] keys = {50, 30, 70, 20, 40, 60, 80};
    for (int k : keys) root = insert(root, k);
    inorder(root);
    System.out.println();
    System.out.println("Height: " + height(root));
  }
}
