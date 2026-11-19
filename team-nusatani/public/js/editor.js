// Simple rich text editor: bold, italic, underline, strike, headings, lists,
// checklist, quote, link, highlight, clear formatting, undo/redo.
import { h, sanitize, isEmptyHtml } from './util.js';
import { t } from './i18n.js';

const TOOLS = [
  ['bold', 'B', 'editor.bold', () => exec('bold')],
  ['italic', 'I', 'editor.italic', () => exec('italic')],
  ['underline', 'U', 'editor.underline', () => exec('underline')],
  ['strikeThrough', 'S', 'editor.strike', () => exec('strikeThrough')],
  'sep',
  ['h2', 'H1', 'editor.heading', () => toggleBlock('h2')],
  ['h3', 'H2', 'editor.subheading', () => toggleBlock('h3')],
  'sep',
  ['insertUnorderedList', '•', 'editor.bullets', () => exec('insertUnorderedList')],
  ['insertOrderedList', '1.', 'editor.numbers', () => exec('insertOrderedList')],
  ['checklist', '☑', 'editor.checklist', (ed) => checklist(ed)],
  ['blockquote', '❝', 'editor.quote', () => toggleBlock('blockquote')],
  'sep',
  ['mark', 'M', 'editor.highlight', () => highlight()],
  ['link', '🔗', 'editor.link', () => link()],
  ['removeFormat', '⨯', 'editor.clear', () => { exec('removeFormat'); exec('formatBlock', '<p>'); }],
  'sep',
  ['undo', '↶', 'editor.undo', () => exec('undo')],
  ['redo', '↷', 'editor.redo', () => exec('redo')],
];

function exec(cmd, arg = null) {
  document.execCommand(cmd, false, arg);
}
function currentBlock() {
  const sel = window.getSelection();
  if (!sel || !sel.anchorNode) return null;
  let n = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
  while (n && !n.classList?.contains('editor-area')) {
    if (/^(H2|H3|BLOCKQUOTE|P|LI|DIV)$/.test(n.tagName)) return n;
    n = n.parentElement;
  }
  return null;
}
function toggleBlock(tag) {
  const b = currentBlock();
  const inside = b && (b.tagName.toLowerCase() === tag || b.closest(tag));
  exec('formatBlock', inside ? '<p>' : `<${tag}>`);
}
function highlight() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const anc = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
  const mark = anc && anc.closest('mark');
  if (mark) {
    mark.replaceWith(...mark.childNodes);
    return;
  }
  const range = sel.getRangeAt(0);
  const m = document.createElement('mark');
  try {
    range.surroundContents(m);
  } catch {
    m.append(range.extractContents());
    range.insertNode(m);
  }
}
function link() {
  const sel = window.getSelection();
  const saved = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  let url = window.prompt(t('editor.linkPrompt'), 'https://');
  if (!url) return;
  url = url.trim();
  if (!/^(https?:|mailto:|tel:)/i.test(url)) url = 'https://' + url;
  if (saved) { sel.removeAllRanges(); sel.addRange(saved); }
  if (!saved || saved.collapsed) {
    exec('insertHTML', `<a href="${url.replace(/"/g, '&quot;')}">${url.replace(/</g, '&lt;')}</a>`);
  } else {
    exec('createLink', url);
  }
}
function checklist(ed) {
  exec('insertUnorderedList');
  const b = currentBlock();
  const ul = b && b.closest('ul');
  if (ul && ed.contains(ul)) ul.classList.toggle('checklist');
}

/**
 * createEditor({ value, placeholder, minHeight, compact })
 * returns { el, area, getHTML(), setHTML(html), isEmpty(), focus() }
 */
export function createEditor(opts = {}) {
  const area = h('div.editor-area', {
    contenteditable: 'true',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': opts.label || t('editor.text'),
    'data-placeholder': opts.placeholder || '',
    style: opts.minHeight ? { minHeight: opts.minHeight } : undefined,
  });
  area.innerHTML = sanitize(opts.value || '');

  const toolbar = h('div.editor-toolbar', { role: 'toolbar' },
    TOOLS.filter((x) => !(opts.compact && Array.isArray(x) && ['h3', 'blockquote', 'undo', 'redo', 'strikeThrough'].includes(x[0])))
      .map((tool) => {
        if (tool === 'sep') return h('span.editor-sep');
        const [id, label, key, run] = tool;
        return h('button.editor-btn', {
          type: 'button', title: t(key), 'aria-label': t(key), 'data-cmd': id,
          onmousedown: (e) => e.preventDefault(),
          onclick: () => { area.focus(); run(area); area.dispatchEvent(new Event('input')); updateState(); },
        }, h('span.editor-btn-label.' + id, label));
      }));

  function updateState() {
    for (const b of toolbar.querySelectorAll('[data-cmd]')) {
      const cmd = b.dataset.cmd;
      let on = false;
      try {
        if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].includes(cmd)) {
          on = document.queryCommandState(cmd);
        } else if (['h2', 'h3', 'blockquote'].includes(cmd)) {
          const blk = currentBlock();
          on = !!(blk && area.contains(blk) && blk.closest(cmd));
        }
      } catch { /* ignore */ }
      b.classList.toggle('on', on);
    }
  }
  document.addEventListener('selectionchange', () => { if (document.activeElement === area) updateState(); });

  // keep pasted content clean
  area.addEventListener('paste', (e) => {
    const html = e.clipboardData && e.clipboardData.getData('text/html');
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    e.preventDefault();
    if (html) exec('insertHTML', sanitize(html));
    else if (text) exec('insertText', text);
  });
  // tick checklist items
  area.addEventListener('click', (e) => {
    const li = e.target.closest && e.target.closest('ul.checklist > li');
    if (li && e.offsetX < 26) {
      li.classList.toggle('done');
      area.dispatchEvent(new Event('input'));
    }
  });
  area.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); link(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && opts.onSubmit) { e.preventDefault(); opts.onSubmit(); }
  });

  const el = h('div.editor' + (opts.compact ? '.editor-compact' : ''), toolbar, area);
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* old browsers */ }

  return {
    el,
    area,
    getHTML: () => sanitize(area.innerHTML).trim(),
    setHTML: (v) => { area.innerHTML = sanitize(v || ''); },
    isEmpty: () => isEmptyHtml(area.innerHTML),
    focus: () => area.focus(),
  };
}
