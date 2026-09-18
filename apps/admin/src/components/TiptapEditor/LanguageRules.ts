import { Rule } from "./TiptapEditor";

export const PYTHON_RULES: Rule[] = [
  { type: "comment", re: /^#[^\n]*/ },
  {
    type: "string",
    re: /^("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/,
  },
  {
    type: "keyword",
    re: /^(?:False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/,
  },
  {
    type: "builtin",
    re: /^(?:print|len|range|type|int|str|list|dict|set|tuple|bool|float|input|open|zip|map|filter|enumerate|sorted|reversed|sum|min|max|abs|round|isinstance|hasattr|getattr|setattr)\b/,
  },
  {
    type: "number",
    re: /^(?:0x[\da-fA-F]+|0b[01]+|\d+\.?\d*(?:[eE][+-]?\d+)?)/,
  },
  { type: "function", re: /^[a-zA-Z_]\w*(?=\s*\()/ },
  { type: "operator", re: /^[=+\-*/%<>!&|^~@]+/ },
];

export const JS_RULES: Rule[] = [
  { type: "comment", re: /^(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)/ },
  {
    type: "string",
    re: /^(?:`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/,
  },
  {
    type: "keyword",
    re: /^(?:async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|static|super|switch|throw|try|typeof|var|void|while|with|yield)\b/,
  },
  {
    type: "builtin",
    re: /^(?:true|false|null|undefined|NaN|Infinity|console|Math|JSON|Object|Array|String|Number|Boolean|Promise|Error|Map|Set|Symbol|Date|RegExp|parseInt|parseFloat|setTimeout|setInterval|fetch|document|window)\b/,
  },
  {
    type: "type",
    re: /^(?:number|string|boolean|any|void|never|unknown|object)\b/,
  },
  {
    type: "number",
    re: /^(?:0x[\da-fA-F]+|0b[01]+|\d+\.?\d*(?:[eE][+-]?\d+)?)/,
  },
  { type: "function", re: /^[a-zA-Z_$][\w$]*(?=\s*\()/ },
  {
    type: "operator",
    re: /^(?:===|!==|=>|\.\.\.|\?\?|&&|\|\||[=+\-*/%<>!&|^~?:])/,
  },
];

export const JAVA_RULES: Rule[] = [
  { type: "comment", re: /^(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)/ },
  { type: "string", re: /^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/ },
  {
    type: "keyword",
    re: /^(?:abstract|assert|break|case|catch|class|continue|default|do|else|enum|extends|final|finally|for|if|implements|import|instanceof|interface|native|new|package|private|protected|public|return|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|volatile|while)\b/,
  },
  {
    type: "type",
    re: /^(?:boolean|byte|char|double|float|int|long|short|void|String|Integer|Double|Boolean|Object|List|Map|Set|Array)\b/,
  },
  {
    type: "builtin",
    re: /^(?:true|false|null|System|Math|Collections|Arrays|StringBuilder|Thread)\b/,
  },
  { type: "number", re: /^(?:0x[\da-fA-F]+|\d+\.?\d*[fFdDlL]?)/ },
  { type: "function", re: /^[a-zA-Z_]\w*(?=\s*\()/ },
  { type: "operator", re: /^(?:>>>|>>=|<<=|[+\-*/%&|^~<>=!]=?|&&|\|\||\?|:)/ },
];

export const CPP_RULES: Rule[] = [
  { type: "comment", re: /^(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)/ },
  { type: "string", re: /^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/ },
  {
    type: "keyword",
    re: /^(?:alignas|alignof|asm|auto|break|case|catch|class|const|constexpr|continue|decltype|default|delete|do|double|else|enum|explicit|export|extern|for|friend|goto|if|inline|mutable|namespace|new|noexcept|nullptr|operator|private|protected|public|register|return|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|try|typedef|typename|union|using|virtual|volatile|while)\b/,
  },
  {
    type: "type",
    re: /^(?:bool|char|double|float|int|long|short|signed|unsigned|void|size_t|string|vector|map|set|pair|tuple|array|optional|variant|unique_ptr|shared_ptr)\b/,
  },
  { type: "builtin", re: /^(?:true|false|nullptr|NULL|std|cout|cin|endl)\b/ },
  {
    type: "number",
    re: /^(?:0x[\da-fA-F]+|0b[01]+|\d+\.?\d*(?:[eE][+-]?\d+)?[uUlLfF]*)/,
  },
  { type: "function", re: /^[a-zA-Z_]\w*(?=\s*\()/ },
  {
    type: "operator",
    re: /^(?:::|-\*|\.\*|->|>>|<<|[+\-*/%&|^~<>=!]=?|&&|\|\||\?|:)/,
  },
];

export const C_RULES: Rule[] = [
  { type: "comment", re: /^(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)/ },
  { type: "string", re: /^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/ },
  {
    type: "keyword",
    re: /^(?:auto|break|case|const|continue|default|do|else|enum|extern|for|goto|if|inline|register|restrict|return|sizeof|static|struct|switch|typedef|union|volatile|while)\b/,
  },
  {
    type: "type",
    re: /^(?:bool|char|double|float|int|long|short|signed|unsigned|void|size_t|ptrdiff_t|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|FILE|NULL)\b/,
  },
  { type: "builtin", re: /^(?:true|false|NULL|EOF|stdin|stdout|stderr)\b/ },
  {
    type: "number",
    re: /^(?:0x[\da-fA-F]+[uUlL]*|0[0-7]+[uUlL]*|\d+\.?\d*(?:[eE][+-]?\d+)?[fFlLuU]*)/,
  },
  { type: "function", re: /^[a-zA-Z_]\w*(?=\s*\()/ },
  { type: "operator", re: /^(?:->|>>|<<|[+\-*/%&|^~<>=!]=?|&&|\|\||\?|:)/ },
];
