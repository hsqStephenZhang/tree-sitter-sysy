/**
 * @file SysY grammar for tree-sitter
 * @license MIT
 *
 * SysY is a subset of C used in the PKU compiler course.
 * Reference: SysY Language Specification (2022)
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Operator precedence (low → high), matching the spec's expression hierarchy:
//   LOrExp  LAndExp  EqExp  RelExp  AddExp  MulExp  UnaryExp
const PREC = {
  LOR:   1,  // ||
  LAND:  2,  // &&
  EQ:    3,  // == !=
  REL:   4,  // < > <= >=
  ADD:   5,  // + -
  MUL:   6,  // * / %
  UNARY: 7,  // + - !
};

module.exports = grammar({
  name: 'sysy',

  extras: $ => [
    /\s/,
    $.line_comment,
    $.block_comment,
  ],

  word: $ => $.identifier,

  // LVal appears in both expression (rvalue via PrimaryExp) and assign_stmt
  // (lvalue).  The same token sequence `id[i]` starts both, so we declare the
  // conflict and let the GLR engine resolve it by lookahead (`=` → assign_stmt;
  // anything else → exp_stmt).
  conflicts: $ => [
    [$.lval, $.expression],
    // "int" identifier is ambiguous: could start var_decl or function_def
    // (whose return type is a func_type node).
    [$.var_decl, $.func_type],
  ],

  rules: {
    // CompUnit -> (Decl | FuncDef)+
    compilation_unit: $ => repeat1(choice(
      $.decl,
      $.function_def,
    )),

    // ------------------------------------------------------------------
    // Declarations
    // ------------------------------------------------------------------

    decl: $ => choice($.const_decl, $.var_decl),

    // "const" "int" ConstDef {"," ConstDef} ";"
    const_decl: $ => seq(
      'const', 'int',
      commaSep1($.const_def),
      ';',
    ),

    // Ident {"[" ConstExp "]"} "=" ConstInitVal
    const_def: $ => seq(
      field('name', $.identifier),
      repeat(seq('[', field('dim', $.const_exp), ']')),
      '=',
      field('init', $.const_init_val),
    ),

    // ConstInitVal -> ConstExp | "{" [ConstInitVal {"," ConstInitVal}] "}"
    const_init_val: $ => choice(
      field('exp', $.const_exp),
      seq('{', '}'),
      seq('{', commaSep1(field('item', $.const_init_val)), '}'),
    ),

    // "int" VarDef {"," VarDef} ";"
    var_decl: $ => seq(
      'int',
      commaSep1($.var_def),
      ';',
    ),

    // Ident {"[" ConstExp "]"} ["=" InitVal]
    var_def: $ => seq(
      field('name', $.identifier),
      repeat(seq('[', field('dim', $.const_exp), ']')),
      optional(seq('=', field('init', $.init_val))),
    ),

    // InitVal -> Exp | "{" [InitVal {"," InitVal}] "}"
    init_val: $ => choice(
      field('exp', $.expression),
      seq('{', '}'),
      seq('{', commaSep1(field('item', $.init_val)), '}'),
    ),

    // ------------------------------------------------------------------
    // Function definition
    // ------------------------------------------------------------------

    // FuncType Ident "(" [FuncFParams] ")" Block
    function_def: $ => seq(
      field('return_type', $.func_type),
      field('name', $.identifier),
      '(',
      optional(field('params', $.func_params)),
      ')',
      field('body', $.block),
    ),

    // FuncType -> "void" | "int"
    func_type: _ => choice('void', 'int'),

    func_params: $ => commaSep1($.func_param),

    // FuncFParam -> "int" Ident ["[" "]" {"[" Exp "]"}]
    // Note: higher array dimensions use Exp (not ConstExp) per the spec.
    func_param: $ => seq(
      'int',
      field('name', $.identifier),
      optional(seq(
        '[', ']',
        repeat(seq('[', field('dim', $.expression), ']')),
      )),
    ),

    // ------------------------------------------------------------------
    // Block
    // ------------------------------------------------------------------

    block: $ => seq('{', repeat($.block_item), '}'),

    block_item: $ => choice($.decl, $.statement),

    // ------------------------------------------------------------------
    // Statements
    // ------------------------------------------------------------------

    statement: $ => choice(
      $.assign_stmt,
      $.exp_stmt,
      $.block,
      $.if_stmt,
      $.while_stmt,
      $.break_stmt,
      $.continue_stmt,
      $.return_stmt,
    ),

    // LVal "=" Exp ";"
    assign_stmt: $ => seq(
      field('lval', $.lval),
      '=',
      field('value', $.expression),
      ';',
    ),

    // [Exp] ";"
    exp_stmt: $ => seq(optional($.expression), ';'),

    // "if" "(" Cond ")" Stmt ["else" Stmt]
    // prec.right shifts "else" to the nearest "if" (dangling-else resolution).
    if_stmt: $ => prec.right(seq(
      'if', '(', field('cond', $.condition), ')',
      field('then', $.statement),
      optional(seq('else', field('else', $.statement))),
    )),

    // "while" "(" Cond ")" Stmt
    while_stmt: $ => seq(
      'while', '(', field('cond', $.condition), ')',
      field('body', $.statement),
    ),

    break_stmt:    _ => seq('break', ';'),
    continue_stmt: _ => seq('continue', ';'),

    // "return" [Exp] ";"
    return_stmt: $ => seq('return', optional(field('value', $.expression)), ';'),

    // ------------------------------------------------------------------
    // Exp (= AddExp in the spec) — arithmetic expression
    //
    // Covers: PrimaryExp, UnaryExp, MulExp, AddExp.
    // Operators: + - * / %  (unary: + - !)
    // ------------------------------------------------------------------

    expression: $ => choice(
      $.number,
      $.lval,                       // PrimaryExp -> LVal
      $.call_expression,            // UnaryExp   -> Ident "(" [FuncRParams] ")"
      $.parenthesized_expression,   // PrimaryExp -> "(" Exp ")"
      $.unary_expression,           // UnaryExp   -> UnaryOp UnaryExp
      $.binary_expression,          // MulExp / AddExp
    ),

    // PrimaryExp -> "(" Exp ")"
    // Uses $.condition so that !(a < b) parses (! applies to a parenthesized
    // condition), which is the universally expected behaviour in SysY programs.
    parenthesized_expression: $ => seq('(', $.condition, ')'),

    // LVal -> Ident {"[" Exp "]"}
    // Reused for both rvalue (inside expression) and lvalue (assign_stmt).
    lval: $ => seq(
      field('name', $.identifier),
      repeat(seq('[', field('index', $.expression), ']')),
    ),

    // Ident "(" [FuncRParams] ")"
    call_expression: $ => seq(
      field('function', $.identifier),
      '(',
      optional(commaSep1(field('argument', $.expression))),
      ')',
    ),

    // UnaryOp UnaryExp — UnaryOp -> "+" | "-" | "!"
    unary_expression: $ => prec.right(PREC.UNARY, seq(
      field('operator', choice('+', '-', '!')),
      field('operand', $.expression),
    )),

    // MulExp -> MulExp ("*"|"/"|"%") UnaryExp
    // AddExp -> AddExp ("+"|"-") MulExp
    binary_expression: $ => choice(
      prec.left(PREC.MUL, seq(field('left', $.expression), field('op', choice('*', '/', '%')), field('right', $.expression))),
      prec.left(PREC.ADD, seq(field('left', $.expression), field('op', choice('+', '-')),      field('right', $.expression))),
    ),

    // ------------------------------------------------------------------
    // Cond (= LOrExp in the spec) — condition expression
    //
    // Extends Exp with relational and logical operators.
    // Used exclusively as the condition of "if" and "while".
    // Precedence (low → high): ||  &&  == !=  < > <= >=
    // ------------------------------------------------------------------

    condition: $ => choice(
      $.expression,
      prec.left(PREC.REL,  seq(field('left', $.condition), field('op', choice('<', '>', '<=', '>=')), field('right', $.condition))),
      prec.left(PREC.EQ,   seq(field('left', $.condition), field('op', choice('==', '!=')),           field('right', $.condition))),
      prec.left(PREC.LAND, seq(field('left', $.condition), field('op', '&&'),                         field('right', $.condition))),
      prec.left(PREC.LOR,  seq(field('left', $.condition), field('op', '||'),                         field('right', $.condition))),
    ),

    // ConstExp is semantically restricted to compile-time constants but
    // syntactically identical to Exp.
    const_exp: $ => $.expression,

    // ------------------------------------------------------------------
    // Terminals
    // ------------------------------------------------------------------

    // IntConst -> decimal | octal | hexadecimal
    number: _ => token(choice(
      /0[xX][0-9a-fA-F]+/,  // hexadecimal (must precede octal rule)
      /0[0-7]*/,             // octal (also matches plain "0")
      /[1-9][0-9]*/,         // decimal
    )),

    identifier: _ => /[_a-zA-Z][_a-zA-Z0-9]*/,

    line_comment:  _ => token(seq('//', /.*/)),

    block_comment: _ => token(seq(
      '/*',
      /[^*]*\*+(?:[^/*][^*]*\*+)*/,
      '/',
    )),
  },
});

/**
 * @param {RuleOrLiteral} rule
 * @returns {SeqRule}
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
