/**
 * calc skill — an EXAMPLE skill with a read-only tool that safely evaluates a
 * basic arithmetic expression (no eval, no globals). Shows how a tool validates
 * its input and returns a plain string. See SKILLS.md for the authoring contract.
 */
'use strict';

// Safely evaluate + - * / ( ) and decimals via a tiny shunting-yard evaluator.
// Rejects anything else. Pure/testable, never touches eval or the environment.
function _evaluate(expr) {
  const tokens = String(expr || '').match(/(\d+\.?\d*|[-+*/()])/g);
  if (!tokens || tokens.join('') !== String(expr || '').replace(/\s+/g, '')) throw new Error('only numbers and + - * / ( ) are allowed');
  const out = [], ops = [], prec = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const apply = () => {
    const op = ops.pop(), b = out.pop(), a = out.pop();
    if (a == null || b == null) throw new Error('bad expression');
    out.push(op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b);
  };
  for (const t of tokens) {
    if (/\d/.test(t)) out.push(parseFloat(t));
    else if (t === '(') ops.push(t);
    else if (t === ')') { while (ops.length && ops[ops.length - 1] !== '(') apply(); if (!ops.length) throw new Error('unbalanced parentheses'); ops.pop(); }
    else { while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) apply(); ops.push(t); }
  }
  while (ops.length) { if (ops[ops.length - 1] === '(') throw new Error('unbalanced parentheses'); apply(); }
  if (out.length !== 1 || !isFinite(out[0])) throw new Error('bad expression');
  return out[0];
}

const tool = {
  name: 'calc',
  description: 'Evaluate a basic arithmetic expression. Args: {"expr":"2 * (3 + 4)"}. Supports + - * / and parentheses.',
  run: async (args) => {
    try { return String(_evaluate((args && (args.expr || args.expression || args._raw)) || '')); }
    catch (e) { return 'error: ' + e.message; }
  },
};

module.exports = { name: 'calc', tools: [tool], _evaluate };
