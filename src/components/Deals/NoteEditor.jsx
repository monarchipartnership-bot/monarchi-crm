import { useRef, useState } from 'react';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import { uploadDealNoteImage } from '../../lib/api/dealNoteImages';
import { htmlToPlainText } from '../../lib/sanitizeHtml';

// `document.execCommand` is deprecated but still fully functional in
// Chrome/Edge (what this team uses) — kept deliberately simple rather than
// pulling in a full rich-text-editor dependency for this one toolbar.
const TOOLBAR = [
  { cmd: 'bold', icon: 'bold', title: 'Жирний' },
  { cmd: 'italic', icon: 'italic', title: 'Курсив' },
  { cmd: 'underline', icon: 'underline', title: 'Підкреслення' },
  { cmd: 'link', icon: 'link', title: 'Посилання' },
  { cmd: 'mention', icon: 'at', title: 'Згадати когось' },
  { cmd: 'image', icon: 'image', title: 'Зображення' },
  { cmd: 'insertUnorderedList', icon: 'bulletList', title: 'Маркований список' },
  { cmd: 'insertOrderedList', icon: 'numberList', title: 'Нумерований список' },
  { cmd: 'indent', icon: 'indent', title: 'Відступ' },
  { cmd: 'outdent', icon: 'outdent', title: 'Виступ' },
  { cmd: 'removeFormat', icon: 'clearFormat', title: 'Зняти форматування' },
];

// A "@query" match ending right at the caret, inside the current text node.
function matchMentionQuery(range) {
  const node = range.startContainer;
  if (node.nodeType !== 3) return null;
  const before = node.textContent.slice(0, range.startOffset);
  const m = before.match(/@(\w*)$/);
  return m ? { query: m[1], start: m.index } : null;
}

export default function NoteEditor({ dealId, profiles, saving, onSave }) {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const pendingMentionsRef = useRef([]);
  const [uploading, setUploading] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [isEmpty, setIsEmpty] = useState(true);

  function focusEditor() { editorRef.current?.focus(); }

  function updateEmpty() {
    setIsEmpty(!htmlToPlainText(editorRef.current?.innerHTML || ''));
  }

  function exec(cmd, value) {
    focusEditor();
    document.execCommand(cmd, false, value);
    updateEmpty();
  }

  function handleToolbarClick(item) {
    if (item.cmd === 'link') {
      const url = prompt('Посилання (URL):');
      if (!url) return;
      exec('createLink', url);
      editorRef.current?.querySelectorAll('a:not([target])').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
      return;
    }
    if (item.cmd === 'mention') {
      exec('insertText', '@');
      setMentionFilter('');
      setMentionOpen(true);
      return;
    }
    if (item.cmd === 'image') {
      fileInputRef.current?.click();
      return;
    }
    exec(item.cmd);
  }

  async function handleImageChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadDealNoteImage(dealId, file);
      if (!url) { alert('Не вдалося завантажити зображення.'); return; }
      exec('insertHTML', `<img class="deal-note-img" src="${url}" alt="">`);
    } finally {
      setUploading(false);
    }
  }

  function handleInput() {
    updateEmpty();
    const sel = window.getSelection();
    if (!sel?.rangeCount || !editorRef.current?.contains(sel.getRangeAt(0).startContainer)) { setMentionOpen(false); return; }
    const match = matchMentionQuery(sel.getRangeAt(0));
    if (match) { setMentionFilter(match.query.toLowerCase()); setMentionOpen(true); }
    else setMentionOpen(false);
  }

  function handleSelectMention(p) {
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const range = sel.getRangeAt(0);
      const match = matchMentionQuery(range);
      if (match) {
        const delRange = document.createRange();
        delRange.setStart(range.startContainer, match.start);
        delRange.setEnd(range.startContainer, range.startOffset);
        delRange.deleteContents();
        sel.removeAllRanges();
        sel.addRange(delRange);
      }
    }
    focusEditor();
    document.execCommand('insertHTML', false, `<span class="deal-note-mention" data-email="${p.email}">@${p.label}</span>&nbsp;`);
    pendingMentionsRef.current.push(p.email);
    setMentionOpen(false);
    updateEmpty();
  }

  async function handleSave() {
    const html = editorRef.current?.innerHTML || '';
    if (!htmlToPlainText(html)) return;
    const ok = await onSave(html, [...new Set(pendingMentionsRef.current)]);
    if (ok !== false && editorRef.current) {
      editorRef.current.innerHTML = '';
      pendingMentionsRef.current = [];
      setIsEmpty(true);
    }
  }

  function handleClear() {
    if (editorRef.current) editorRef.current.innerHTML = '';
    pendingMentionsRef.current = [];
    setIsEmpty(true);
  }

  const filteredProfiles = (profiles || []).filter(
    (p) => p.label.toLowerCase().includes(mentionFilter) || p.email.toLowerCase().includes(mentionFilter),
  );

  return (
    <div className="deal-note-editor-wrap">
      <div
        ref={editorRef}
        className="deal-note-editor"
        contentEditable
        onInput={handleInput}
        onBlur={() => setTimeout(() => setMentionOpen(false), 150)}
        data-placeholder="Нова нотатка..."
      />
      {mentionOpen && filteredProfiles.length > 0 && (
        <div className="deal-note-mention-dropdown">
          {filteredProfiles.map((p) => (
            <button type="button" key={p.email} onMouseDown={(e) => { e.preventDefault(); handleSelectMention(p); }}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageChange} />
      <div className="deal-note-toolbar">
        <div className="deal-note-toolbar-icons">
          {TOOLBAR.map((item) => (
            <button
              type="button" key={item.cmd} title={item.title}
              disabled={item.cmd === 'image' && uploading}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleToolbarClick(item)}
            >
              <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS[item.icon] }} />
            </button>
          ))}
        </div>
        <div className="deal-note-toolbar-actions">
          <button type="button" className="btn" onClick={handleClear} disabled={isEmpty}>Очистити</button>
          <button type="button" className="btn btn-p" onClick={handleSave} disabled={isEmpty || saving}>
            {saving ? 'Зберігаємо…' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
}
