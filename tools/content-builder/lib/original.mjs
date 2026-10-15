// Original booklets written for this project, in a tiny Markdown dialect:
//   # Part title          -> part
//   ## Chapter title      -> chapter
//   > quote               -> italic paragraph
//   - item                -> bullet paragraph
//   ```code```            -> verse-like block (lines kept)
//   ***                   -> scene break
export function parseOriginal(book, raw) {
  const blocks = [];
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  let para = [];
  let code = null;
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ').trim() });
    para = [];
  };
  for (const line of lines) {
    if (code) {
      if (line.startsWith('```')) { blocks.push({ type: 'verse', lines: code, code: true }); code = null; } else code.push(line || ' ');
      continue;
    }
    if (line.startsWith('```')) { flush(); code = []; continue; }
    if (!line.trim()) { flush(); continue; }
    if (line.startsWith('## ')) { flush(); blocks.push({ type: 'chapter', label: '', title: line.slice(3).trim() }); continue; }
    if (line.startsWith('# ')) { flush(); blocks.push({ type: 'part', title: line.slice(2).trim() }); continue; }
    if (line.trim() === '***') { flush(); blocks.push({ type: 'break' }); continue; }
    if (line.startsWith('> ')) { flush(); blocks.push({ type: 'p', text: line.slice(2).trim(), italic: true }); continue; }
    if (/^[-*] /.test(line)) { flush(); blocks.push({ type: 'p', text: '•  ' + line.slice(2).trim(), bullet: true }); continue; }
    para.push(line.trim());
  }
  flush();
  return blocks;
}
