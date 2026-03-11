import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client';

interface Note {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

// Minimal markdown renderer: bold, italic, inline code, headings, bullets
function renderMarkdown(md: string): string {
  return md
    // headings
    .replace(/^### (.+)$/gm, '<strong class="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">$1</strong>')
    .replace(/^## (.+)$/gm, '<span class="font-semibold text-gray-800 dark:text-gray-200">$1</span>')
    .replace(/^# (.+)$/gm, '<span class="font-bold text-gray-900 dark:text-gray-100">$1</span>')
    // bullet points
    .replace(/^[-*] (.+)$/gm, '<span class="flex gap-1"><span class="text-gray-400 shrink-0">•</span><span>$1</span></span>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // inline code
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs font-mono">$1</code>')
    // line breaks
    .replace(/\n/g, '<br/>');
}

function NoteCard({ note, onEdit, onDelete }: { note: Note; onEdit: (note: Note) => void; onDelete: (id: string) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div
      className="group relative border border-gray-100 dark:border-gray-700 rounded-lg p-3 hover:border-indigo-200 dark:hover:border-indigo-700 cursor-pointer transition-colors bg-white dark:bg-gray-800/50"
      onClick={() => onEdit(note)}
    >
      <div
        className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-3"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(note.content) }}
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          {new Date(note.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
        <div className="opacity-0 group-hover:opacity-100 flex gap-1" onClick={e => e.stopPropagation()}>
          {confirmDelete ? (
            <>
              <button
                onClick={() => onDelete(note.id)}
                className="text-[10px] text-red-500 hover:text-red-700 font-medium"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-0.5 rounded text-gray-400 hover:text-red-500"
              title="Delete note"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function QuickNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [input, setInput] = useState('');
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.getNotes()
      .then(setNotes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  const handleSave = useCallback(async () => {
    if (!input.trim() || saving) return;
    setSaving(true);
    try {
      if (editingNote) {
        const updated = await api.updateNote(editingNote.id, input);
        setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
        setEditingNote(null);
      } else {
        const created = await api.createNote(input);
        setNotes(prev => [created, ...prev]);
      }
      setInput('');
    } catch {} finally {
      setSaving(false);
    }
  }, [input, saving, editingNote]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl+Enter to save
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    // Escape to cancel edit
    if (e.key === 'Escape' && editingNote) {
      setEditingNote(null);
      setInput('');
    }
  };

  const handleEdit = (note: Note) => {
    setEditingNote(note);
    setInput(note.content);
    textareaRef.current?.focus();
  };

  const handleDelete = async (id: string) => {
    await api.deleteNote(id).catch(() => {});
    setNotes(prev => prev.filter(n => n.id !== id));
    if (editingNote?.id === id) {
      setEditingNote(null);
      setInput('');
    }
  };

  const handleCancelEdit = () => {
    setEditingNote(null);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Composer */}
      <div className="p-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
        {editingNote && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-indigo-500 font-medium uppercase tracking-wide">Editing note</span>
            <button onClick={handleCancelEdit} className="text-[10px] text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Quick note... (Markdown supported, ⌘↵ to save)"
          rows={2}
          className="w-full text-xs resize-none rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:focus:ring-indigo-500 transition-all"
          style={{ minHeight: '64px' }}
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-gray-400">Markdown supported</span>
          <button
            onClick={handleSave}
            disabled={!input.trim() || saving}
            className="px-3 py-1 text-xs font-medium rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {saving ? 'Saving…' : editingNote ? 'Update' : 'Save note'}
          </button>
        </div>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 opacity-50">
            <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
            </svg>
            <p className="text-xs text-gray-400 dark:text-gray-500">No notes yet.<br/>Write something above.</p>
          </div>
        ) : (
          notes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
