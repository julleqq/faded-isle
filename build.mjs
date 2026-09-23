// Bundles the game into ONE self-contained HTML file (no server needed):
//   node build.mjs            -> faded-isle.html (full document, downloadable)
//   node build.mjs --fragment -> page body only, for hosts that add their own <head>
// Each ES module becomes a function scope; exports are exposed through getters
// so live bindings (like ui.busy) keep working.
import fs from 'fs';
import path from 'path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const ORDER = ['world.js', 'content.js', 'audio.js', 'ui.js', 'art.js', 'exercises.js', 'finale.js', 'game.js'];
const id = f => '__' + f.replace('.js', '');

let js = '';
for (const f of ORDER) {
  let src = read(f);
  const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  src = src
    .replace(/^export\s+/gm, '')
    .replace(/^import \* as (\w+) from '\.\/(\w+)\.js';$/gm, (_, n, m) => `const ${n} = __${m};`)
    .replace(/^import \{([^}]+)\} from '\.\/(\w+)\.js';$/gm, (_, n, m) => `const {${n}} = __${m};`);
  if (/^import /m.test(src)) throw new Error(`unhandled import in ${f}`);
  js += `const ${id(f)} = (() => {\n${src}\nreturn { ${names.map(n => `get ${n}() { return ${n}; }`).join(', ')} };\n})();\n`;
}

const html = read('index.html');
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, 'icon-180.png')).toString('base64');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));
const title = html.match(/<title>.*<\/title>/)[0];
const style = `<style>\n${read('style.css')}</style>`;
const script = `<script>\nwindow.__SINGLE_FILE__ = true;\n(() => {\n${js}})();\n</script>`;

if (process.argv.includes('--fragment')) {
  process.stdout.write(`${title}\n${style}\n${body}${script}\n`);
} else {
  const head = html.slice(0, html.indexOf('</head>'))
    .replace(/\s*<link rel="manifest"[^>]*>/, '')
    .replace(/<link rel="stylesheet"[^>]*>/, style)
    .replace(/href="icon-180\.png"/g, `href="${icon}"`);
  fs.writeFileSync(path.join(dir, 'faded-isle.html'), `${head}</head>\n<body>${body}${script}\n</body>\n</html>\n`);
  console.log('wrote faded-isle.html');
}
