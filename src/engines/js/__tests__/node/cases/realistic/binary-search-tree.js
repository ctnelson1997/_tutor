// A binary search tree with insert, search, in-order traversal, min and height
class TreeNode {
  constructor(key) {
    this.key = key;
    this.left = null;
    this.right = null;
  }
}

class BST {
  constructor() {
    this.root = null;
    this.size = 0;
  }

  insert(key) {
    const node = new TreeNode(key);
    this.size++;
    if (!this.root) {
      this.root = node;
      return;
    }
    let current = this.root;
    while (true) {
      if (key < current.key) {
        if (current.left === null) {
          current.left = node;
          return;
        }
        current = current.left;
      } else {
        if (current.right === null) {
          current.right = node;
          return;
        }
        current = current.right;
      }
    }
  }

  contains(key) {
    let current = this.root;
    while (current) {
      if (key === current.key) return true;
      current = key < current.key ? current.left : current.right;
    }
    return false;
  }

  inOrder(node = this.root, out = []) {
    if (node) {
      this.inOrder(node.left, out);
      out.push(node.key);
      this.inOrder(node.right, out);
    }
    return out;
  }

  min() {
    let current = this.root;
    while (current.left) {
      current = current.left;
    }
    return current.key;
  }

  height(node = this.root) {
    if (node === null) return 0;
    return 1 + Math.max(this.height(node.left), this.height(node.right));
  }
}

const tree = new BST();
[50, 30, 70, 20, 40, 60, 80, 35].forEach(k => tree.insert(k));
const sortedKeys = tree.inOrder();
console.log("In order:", sortedKeys.join(" "));
console.log("Contains 40?", tree.contains(40));
console.log("Contains 65?", tree.contains(65));
console.log("Min:", tree.min(), "Height:", tree.height(), "Size:", tree.size);
