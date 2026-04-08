/**
 * @file SysY grammar for tree-sitter
 * @license MIT
 *
 * SysY is a subset of C used in the PKU compiler course.
 * Grammar source: https://github.com/pku-minic/kira-rs/blob/master/src/sysy.lalrpop
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
  LOR: 1,
  LAND: 2,
  EQ: 3,
  REL: 4,
  ADD: 5,
  MUL: 6,
  UNARY: 7,
  CALL: 8,
  SUBSCRIPT: 9,
};

module.exports = grammar({
  name: 'sysy',

  extras: $ => [
    /\s/,
    $.line_comment,
    $.block_comment,
  ],

  word: $ => $.identifier,

  // lval vs expression: at statement level, `id[i] =` could start either an
  // assign_stmt (lval) or an exp_stmt (expression).  GLR resolves it.
  conflicts: $ => [
    [$.lval, $.expression],
  ],

  rules: {
    // CompUnit ::= (Decl | FuncDef)*
    compilation_unit: $ => repeat(choice(
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

    init_val: $ => choice(
      field('exp', $.expression),
      seq('{', '}'),
      seq('{', commaSep1(field('item', $.init_val)), '}'),
    ),

    // ------------------------------------------------------------------
    // Function definition
    // ------------------------------------------------------------------

    // ("void" | "int") Ident "(" [FuncFParams] ")" Block
    function_def: $ => seq(
      field('return_type', choice('void', 'int')),
      field('name', $.identifier),
      '(',
      optional(field('params', $.func_params)),
      ')',
      field('body', $.block),
    ),

    func_params: $ => commaSep1($.func_param),

    // "int" Ident ["[" "]" {"[" ConstExp "]"}]
    func_param: $ => seq(
      'int',
      field('name', $.identifier),
      optional(seq(
        '[', ']',
        repeat(seq('[', field('dim', $.const_exp), ']')),
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

    // Dangling-else resolved by prec.right: shift "else" rather than reduce.
    if_stmt: $ => prec.right(seq(
      'if', '(', field('cond', $.expression), ')',
      field('then', $.statement),
      optional(seq('else', field('else', $.statement))),
    )),

    while_stmt: $ => seq(
      'while', '(', field('cond', $.expression), ')',
      field('body', $.statement),
    ),

    break_stmt: _ => seq('break', ';'),
    continue_stmt: _ => seq('continue', ';'),

    return_stmt: $ => seq('return', optional(field('value', $.expression)), ';'),

    // ------------------------------------------------------------------
    // Expressions
    //
    // Precedence (low → high):
    //   ||  &&  ==!=  < > <= >=  + -  * / %  unary  call  subscript
    // ------------------------------------------------------------------

    expression: $ => choice(
      $.number,
      $.identifier,
      $.subscript_expression,
      $.call_expression,
      $.parenthesized_expression,
      $.unary_expression,
      $.binary_expression,
    ),

    parenthesized_expression: $ => seq('(', $.expression, ')'),

    // id[i][j]...  — used as both rvalue and lvalue
    // rvalue form: chained subscript_expressions starting from identifier
    subscript_expression: $ => prec.left(PREC.SUBSCRIPT, seq(
      field('object', $.expression),
      '[',
      field('index', $.expression),
      ']',
    )),

    // id(args)  — only identifiers may be called in SysY
    call_expression: $ => prec(PREC.CALL, seq(
      field('function', $.identifier),
      '(',
      optional(commaSep1(field('argument', $.expression))),
      ')',
    )),

    unary_expression: $ => prec.right(PREC.UNARY, seq(
      field('operator', choice('+', '-', '!')),
      field('operand', $.expression),
    )),

    binary_expression: $ => choice(
      prec.left(PREC.MUL,  seq($.expression, field('op', choice('*', '/', '%')), $.expression)),
      prec.left(PREC.ADD,  seq($.expression, field('op', choice('+', '-')),      $.expression)),
      prec.left(PREC.REL,  seq($.expression, field('op', choice('<', '>', '<=', '>=')), $.expression)),
      prec.left(PREC.EQ,   seq($.expression, field('op', choice('==', '!=')),   $.expression)),
      prec.left(PREC.LAND, seq($.expression, field('op', '&&'),                 $.expression)),
      prec.left(PREC.LOR,  seq($.expression, field('op', '||'),                 $.expression)),
    ),

    // LVal used as assignment target: Ident {"[" Exp "]"}
    // In expression context use identifier + subscript_expression instead.
    lval: $ => seq(
      field('name', $.identifier),
      repeat(seq('[', field('index', $.expression), ']')),
    ),

    // ConstExp is semantically restricted but syntactically identical to Exp.
    const_exp: $ => $.expression,

    // ------------------------------------------------------------------
    // Terminals
    // ------------------------------------------------------------------

    // Decimal, octal, hex integer literals — no floats in SysY.
    number: _ => token(choice(
      /0[xX][0-9a-fA-F]+/,   // hex (must come first)
      /0[0-7]*/,              // octal (matches plain "0" too)
      /[1-9][0-9]*/,          // decimal
    )),

    identifier: _ => /[_a-zA-Z][_a-zA-Z0-9]*/,

    line_comment: _ => token(seq('//', /.*/)),

    // Block comment: /* ... */ (non-nested, matching the LALRPOP spec)
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
