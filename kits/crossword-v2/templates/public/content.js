/**
 * content.js — the ONLY file the deploy-time LLM (re)generates. The crossword
 * GAME is fixed template code; this just supplies themed words + clues.
 * Shape: THEME_CONTENT = { easy:[{word,clue}], medium:[...], hard:[...] }.
 * Words UPPERCASE A–Z only; share common letters (E,A,T,O,R,S,N,I,L) so the
 * grid crosses well. Default theme = technology.
 */
var THEME_CONTENT = {
  easy: [
    { word: 'CODE', clue: 'What developers write' },
    { word: 'DATA', clue: 'Stored information' },
    { word: 'NODE', clue: 'JavaScript runtime' },
    { word: 'BYTE', clue: 'Eight bits' },
    { word: 'LOOP', clue: 'Repeated execution' },
    { word: 'FILE', clue: 'Saved document' },
    { word: 'LINK', clue: 'Clickable connection' },
    { word: 'PORT', clue: 'Network endpoint' },
    { word: 'TYPE', clue: 'Data classification' },
    { word: 'EDIT', clue: 'Change content' },
    { word: 'ICON', clue: 'Small symbol' },
    { word: 'MENU', clue: 'List of options' },
  ],
  medium: [
    { word: 'SERVER', clue: 'Serves requests' },
    { word: 'ARRAY', clue: 'Ordered list' },
    { word: 'STRING', clue: 'Text value' },
    { word: 'OBJECT', clue: 'Key-value structure' },
    { word: 'ROUTER', clue: 'Directs traffic' },
    { word: 'SCRIPT', clue: 'A runnable program' },
    { word: 'BINARY', clue: 'Base-2 numbers' },
    { word: 'SOCKET', clue: 'Two-way connection endpoint' },
    { word: 'RENDER', clue: 'Draw to screen' },
    { word: 'MODULE', clue: 'Reusable code unit' },
    { word: 'STREAM', clue: 'Flow of data' },
    { word: 'ENTITY', clue: 'A modelled thing' },
  ],
  hard: [
    { word: 'ALGORITHM', clue: 'Step-by-step procedure' },
    { word: 'DATABASE', clue: 'Organized data store' },
    { word: 'FRONTEND', clue: 'Client-side layer' },
    { word: 'ITERATOR', clue: 'Yields items in turn' },
    { word: 'RECURSION', clue: 'A function calling itself' },
    { word: 'COMPILER', clue: 'Source to machine code' },
    { word: 'PROTOCOL', clue: 'Communication rules' },
    { word: 'ABSTRACT', clue: 'Hide the details' },
    { word: 'RESOLVER', clue: 'Turns a name into an address' },
    { word: 'TEMPLATE', clue: 'Reusable pattern' },
    { word: 'INSTANCE', clue: 'A concrete object' },
    { word: 'REGISTER', clue: 'Tiny fast CPU store' },
  ],
};
