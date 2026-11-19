/**
 * theme.js — the ONLY file the deploy-time LLM (re)generates. The block-drop
 * GAME is fixed template code; this just supplies a visual theme.
 * Shape: THEME = { title, bg, glow, pieceColors:{1:I,2:O,3:T,4:S,5:Z,6:J,7:L}, garbage }.
 * Colours are CSS colour strings. Default = neon arcade.
 */
var THEME = {
  title: 'BLOCK DROP',
  bg: '#0b0f1a',
  glow: true,
  pieceColors: {
    1: '#22d3ee', // I - cyan
    2: '#facc15', // O - yellow
    3: '#c084fc', // T - purple
    4: '#4ade80', // S - green
    5: '#f87171', // Z - red
    6: '#60a5fa', // J - blue
    7: '#fb923c', // L - orange
  },
  garbage: '#5b6472',
};
