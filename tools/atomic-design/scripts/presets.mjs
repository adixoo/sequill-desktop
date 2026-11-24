// Framework presets: which files to audit and which patterns break the rules.
// Add a framework by adding an entry; audit.mjs needs no change.
//   extensions        files the audit reads
//   componentSuffixes files inside a level folder that count as components
//   imports           regex whose group 1 is the imported path (null = no import check)
//   dotImports        imports use dots (com.app.ui.atoms.X) instead of slashes
//   bareRelative      an import without "scheme:" is relative to the file (Dart)
//   hardcoded         values that should come from design tokens
//   natives           platform widgets to replace with an atom; group 1 = widget name,
//                     atom = name endings that identify the matching atom (lowercase)

// Not a link anchor (href="#add") or a private class field (#cafe = 1, #feed()).
const HEX = /(?<![\w.&]|(?:href|to)=["'])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b(?!\s*[=(])/;
const SIZE = '(?<![\\w.])(?:[2-9]|\\d{2,})'; // 0 and 1 are not design decisions
const BUTTON = ['button'];
const FIELD = ['textfield', 'input', 'field'];

export const PRESETS = {
  // React, Next.js, React Native, Expo, Vue, Nuxt, Svelte, Angular, Electron and Tauri front ends
  js: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.html', '.css', '.scss'],
    componentSuffixes: ['.jsx', '.tsx', '.vue', '.svelte', '.component.ts'],
    imports: /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm,
    hardcoded: [HEX, /\b(?:rgba?|hsla?)\(\s*\d/, new RegExp(`${SIZE}(?:\\.\\d+)?px\\b`)],
    natives: [
      { pattern: /<(button)\b/, atom: BUTTON },
      { pattern: /<(input)\b/, atom: ['input'] },
      { pattern: /<(select)\b/, atom: ['select'] },
      { pattern: /<(textarea)\b/, atom: ['textarea'] },
      { pattern: /<(Pressable|TouchableOpacity|TouchableHighlight)\b/, atom: BUTTON },
      { pattern: /<(TextInput)\b/, atom: ['input'] },
    ],
  },
  flutter: {
    extensions: ['.dart'],
    componentSuffixes: ['.dart'],
    imports: /^[ \t]*(?:import|export)\s+['"]([^'"]+)['"]/gm,
    bareRelative: true,
    hardcoded: [
      /\bColor\(\s*0x/,
      /\bColors\.(?!transparent\b)\w+/,
      new RegExp(`\\bEdgeInsets\\.\\w+\\([^)]*?${SIZE}`),
      /\bfontSize:\s*\d/,
    ],
    natives: [
      { pattern: /(?<![\w.])(ElevatedButton|TextButton|OutlinedButton|FilledButton)\s*\(/, atom: BUTTON },
      { pattern: /(?<![\w.])(TextField|TextFormField)\s*\(/, atom: FIELD },
    ],
  },
  // Jetpack Compose and Compose Multiplatform
  compose: {
    extensions: ['.kt'],
    componentSuffixes: ['.kt'],
    imports: /^[ \t]*import\s+([\w.]+)/gm,
    dotImports: true,
    hardcoded: [
      /\bColor\(\s*0x/,
      /\bColor\.(?!Transparent\b|Unspecified\b)[A-Z]\w*/,
      new RegExp(`${SIZE}(?:\\.\\d+)?\\.(?:dp|sp)\\b`),
    ],
    natives: [
      { pattern: /(?<![\w.])(Button|OutlinedButton|TextButton|ElevatedButton|FilledButton)\s*\(/, atom: BUTTON },
      { pattern: /(?<![\w.])(TextField|OutlinedTextField|BasicTextField)\s*\(/, atom: FIELD },
    ],
  },
  swiftui: {
    extensions: ['.swift'],
    componentSuffixes: ['.swift'],
    imports: null, // files in one Swift module don't import each other; /atomic-audit reviews direction
    hardcoded: [
      /\b(?:UI)?Color\(\s*(?:red|hue|white):/,
      /#colorLiteral/,
      // only the system palette: Color.brand is how SwiftUI projects name their own tokens
      /\bColor\.(?:red|orange|yellow|green|mint|teal|cyan|blue|indigo|purple|pink|brown|white|gray|black)\b/,
      new RegExp(`\\.padding\\(\\s*(?:\\.\\w+\\s*,\\s*)?${SIZE}`),
      /\.system\(\s*size:\s*\d/,
    ],
    natives: [
      { pattern: /(?<![\w.])(Button)\s*[({]/, atom: BUTTON },
      { pattern: /(?<![\w.])(TextField|SecureField)\s*\(/, atom: FIELD },
    ],
  },
};
