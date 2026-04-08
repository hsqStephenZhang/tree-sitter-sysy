; Keywords
[
  "const"
  "int"
  "void"
  "if"
  "else"
  "while"
  "break"
  "continue"
  "return"
] @keyword

; Operators
(binary_expression op: _ @operator)
(unary_expression operator: _ @operator)
"=" @operator

; Literals
(number) @number

; Comments
(line_comment) @comment
(block_comment) @comment

; Delimiters
[";" "," "[" "]" "(" ")"] @punctuation.delimiter
["{" "}"] @punctuation.bracket

; Function definitions
(function_def name: (identifier) @function)

; Function calls
(call_expression function: (identifier) @function)

; Parameters
(func_param name: (identifier) @variable.parameter)

; Assignment target (lval)
(assign_stmt lval: (lval name: (identifier) @variable))

; Const / var declaration names
(const_def name: (identifier) @variable)
(var_def name: (identifier) @variable)

; General identifiers
(identifier) @variable
