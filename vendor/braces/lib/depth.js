'use strict';

// Bound recursion in all AST walkers, including ASTs supplied directly by callers.
const MAX_DEPTH = 128;
const assertDepth = depth => {
  if (depth > MAX_DEPTH) {
    throw new SyntaxError(`Brace pattern nesting exceeds ${MAX_DEPTH} levels`);
  }
};

const assertTreeDepth = ast => {
  const pending = [{ node: ast, depth: 0 }];
  while (pending.length) {
    const { node, depth } = pending.pop();
    assertDepth(depth);
    if (node.nodes) {
      for (const child of node.nodes) pending.push({ node: child, depth: depth + 1 });
    }
  }
};

module.exports = { assertDepth, assertTreeDepth };
