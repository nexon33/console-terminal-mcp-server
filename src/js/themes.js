/**
 * Terminal themes for MCP Server with glassmorphism support
 * This module contains theme definitions for the terminal component
 */

// Advanced terminal themes with glassmorphism support
const themes = {
  dark: {
    background: 'rgba(22, 22, 26, 0.95)',
    foreground: '#f2f2f2',
    black: '#121212',
    red: '#ff5f56',
    green: '#27c93f',
    yellow: '#ffbd2e',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#dcdfe4',
    brightBlack: '#5a6374',
    brightRed: '#ff6e67',
    brightGreen: '#5af78e',
    brightYellow: '#ffcc95',
    brightBlue: '#65b9ff',
    brightMagenta: '#d599ef',
    brightCyan: '#67d3c2',
    brightWhite: '#ffffff',
    selectionBackground: 'rgba(255, 255, 255, 0.2)',
    cursor: '#f2f2f2'
  },
  light: {
    background: 'rgba(245, 245, 245, 0.92)',
    foreground: '#333333',
    black: '#000000',
    red: '#e45649',
    green: '#50a14f',
    yellow: '#c18401',
    blue: '#0184bc',
    magenta: '#a626a4',
    cyan: '#0997b3',
    white: '#bfbfbf',
    brightBlack: '#777777',
    brightRed: '#f07178',
    brightGreen: '#7eca9c',
    brightYellow: '#e5c07b',
    brightBlue: '#82aaff',
    brightMagenta: '#c792ea',
    brightCyan: '#7fdbca',
    brightWhite: '#ffffff',
    selectionBackground: 'rgba(0, 0, 0, 0.1)',
    cursor: '#333333'
  },
  nord: {
    background: 'rgba(46, 52, 64, 0.95)',
    foreground: '#d8dee9',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4',
    selectionBackground: 'rgba(216, 222, 233, 0.2)',
    cursor: '#d8dee9'
  },
  dracula: {
    background: 'rgba(40, 42, 54, 0.95)',
    foreground: '#f8f8f2',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
    selectionBackground: 'rgba(248, 248, 242, 0.2)',
    cursor: '#f8f8f2'
  }
};

// Export themes for use in terminal.js
export default themes; 