import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

// ── Types ─────────────────────────────────────────────────────────

interface Contact {
  id: string;
  name: string;
  nickname?: string;
  company?: string;
  job_title?: string;
  email?: string;
  phone?: string;
  website?: string;
  location?: string;
  birthday?: string;
  how_met?: string;
  notes?: string;
  relationship_type: string;
  contact_frequency_days?: number;
  last_contacted_at?: string;
  is_favorite: number;
  archived: number;
  tags: string[];
  fields?: { id: string; field_group: string; field_label: string; field_value: string; position: number }[];
  interactions?: Interaction[];
  created_at: string;
  updated_at: string;
}

interface Interaction {
  id: string;
  contact_id: string;
  type: string;
  title?: string;
  description?: string;
  interaction_date: string;
  created_at: string;
}

const RELATIONSHIP_TYPES = ['friend', 'family', 'colleague', 'acquaintance', 'professional'];
const INTERACTION_TYPES = ['call', 'meeting', 'coffee', 'email', 'message', 'note', 'gift', 'intro', 'other'];

const INTERACTION_ICONS: Record<string, string> = {
  call: '📞', meeting: '🤝', coffee: '☕', email: '📧',
  message: '💬', note: '📝', gift: '🎁', intro: '👋', other: '📌',
};

const REL_COLORS: Record<string, string> = {
  friend: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  family: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  colleague: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  acquaintance: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  professional: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
};

// ── Main Component ────────────────────────────────────────────────

export default function Phonebook() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [leftTab, setLeftTab] = useState<'all' | 'groups'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // ── Fetch contacts ────────────────────────────────────────────

  const fetchContacts = useCallback(async () => {
    try {
      const params: any = {};
      if (searchQuery) params.q = searchQuery;
      if (filterType) params.type = filterType;
      if (showArchived) params.archived = '1';
      const data = await api.getContacts(params);
      setContacts(data);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    }
    setLoading(false);
  }, [searchQuery, filterType, showArchived]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // ── Fetch selected contact detail ─────────────────────────────

  const fetchDetail = useCallback(async (id: string) => {
    try {
      const data = await api.getContact(id);
      setSelectedContact(data);
    } catch (err) {
      console.error('Failed to fetch contact detail:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
    else setSelectedContact(null);
  }, [selectedId, fetchDetail]);

  // ── Actions ───────────────────────────────────────────────────

  const handleCreate = async (data: any) => {
    try {
      const created = await api.createContact(data);
      setShowCreateModal(false);
      await fetchContacts();
      setSelectedId(created.id);
    } catch (err) {
      console.error('Failed to create contact:', err);
    }
  };

  const handleUpdate = async (data: any) => {
    if (!selectedId) return;
    try {
      await api.updateContact(selectedId, data);
      setEditMode(false);
      await fetchContacts();
      await fetchDetail(selectedId);
    } catch (err) {
      console.error('Failed to update contact:', err);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !confirm('Delete this contact? This cannot be undone.')) return;
    try {
      await api.deleteContact(selectedId);
      setSelectedId(null);
      setSelectedContact(null);
      await fetchContacts();
    } catch (err) {
      console.error('Failed to delete contact:', err);
    }
  };

  const handleToggleFavorite = async () => {
    if (!selectedId) return;
    try {
      await api.toggleContactFavorite(selectedId);
      await fetchContacts();
      await fetchDetail(selectedId);
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleAddInteraction = async (data: any) => {
    if (!selectedId) return;
    try {
      await api.createInteraction(selectedId, data);
      await fetchDetail(selectedId);
      await fetchContacts();
    } catch (err) {
      console.error('Failed to add interaction:', err);
    }
  };

  const handleDeleteInteraction = async (intId: string) => {
    try {
      await api.deleteInteraction(intId);
      if (selectedId) {
        await fetchDetail(selectedId);
        await fetchContacts();
      }
    } catch (err) {
      console.error('Failed to delete interaction:', err);
    }
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 sm:px-16 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Phonebook</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Contact
          </button>
        </div>

        {/* Main layout: 2/5 left, 3/5 right */}
        <div className="flex gap-6" style={{ minHeight: 'calc(100vh - 180px)' }}>
          {/* ── Left Column: Rolodex ─────────────────────────── */}
          <div className="w-2/5 flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setLeftTab('all')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  leftTab === 'all'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                All Contacts
              </button>
              <button
                onClick={() => setLeftTab('groups')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  leftTab === 'groups'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Groups
              </button>
            </div>

            {leftTab === 'all' ? (
              <>
                {/* Search + filters */}
                <div className="p-3 space-y-2 border-b border-gray-100 dark:border-gray-700">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search contacts..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={filterType}
                      onChange={e => setFilterType(e.target.value)}
                      className="flex-1 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
                    >
                      <option value="">All types</option>
                      {RELATIONSHIP_TYPES.map(t => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showArchived}
                        onChange={e => setShowArchived(e.target.checked)}
                        className="rounded"
                      />
                      Archived
                    </label>
                  </div>
                </div>

                {/* Contact list */}
                <div className="flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">Loading...</div>
                  ) : contacts.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">
                      {searchQuery ? `No contacts matching "${searchQuery}"` : 'No contacts yet'}
                    </div>
                  ) : (
                    contacts.map(c => (
                      <div
                        key={c.id}
                        onClick={() => { setSelectedId(c.id); setEditMode(false); }}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 dark:border-gray-700/50 transition-colors ${
                          selectedId === c.id
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        {/* Avatar circle */}
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.name}</span>
                            {c.is_favorite === 1 && <span className="text-amber-400 text-xs">★</span>}
                          </div>
                          {c.company && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.company}</div>
                          )}
                        </div>
                        {c.tags.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
                            {c.tags[0]}{c.tags.length > 1 ? ` +${c.tags.length - 1}` : ''}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Count footer */}
                {!loading && contacts.length > 0 && (
                  <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-[10px] text-gray-400">
                    {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
                  </div>
                )}
              </>
            ) : (
              /* Groups tab - placeholder */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-400 dark:text-gray-500">
                  <div className="text-3xl mb-2">👥</div>
                  <div className="text-sm">Groups coming soon</div>
                </div>
              </div>
            )}
          </div>

          {/* ── Right Column: Detail ─────────────────────────── */}
          <div className="w-3/5 flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
            {!selectedContact ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-400 dark:text-gray-500">
                  <div className="text-4xl mb-3">👤</div>
                  <div className="text-sm">Select a contact to view details</div>
                </div>
              </div>
            ) : editMode ? (
              <ContactForm
                contact={selectedContact}
                onSave={handleUpdate}
                onCancel={() => setEditMode(false)}
              />
            ) : (
              <ContactDetail
                contact={selectedContact}
                onEdit={() => setEditMode(true)}
                onDelete={handleDelete}
                onToggleFavorite={handleToggleFavorite}
                onAddInteraction={handleAddInteraction}
                onDeleteInteraction={handleDeleteInteraction}
              />
            )}
          </div>
        </div>
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto">
            <ContactForm
              onSave={handleCreate}
              onCancel={() => setShowCreateModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Contact Detail View ─────────────────────────────────────────

function ContactDetail({
  contact,
  onEdit,
  onDelete,
  onToggleFavorite,
  onAddInteraction,
  onDeleteInteraction,
}: {
  contact: Contact;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onAddInteraction: (data: any) => void;
  onDeleteInteraction: (id: string) => void;
}) {
  const [showInteractionForm, setShowInteractionForm] = useState(false);
  const [intType, setIntType] = useState('note');
  const [intTitle, setIntTitle] = useState('');
  const [intDesc, setIntDesc] = useState('');
  const [intDate, setIntDate] = useState(new Date().toISOString().split('T')[0]);

  const handleSubmitInteraction = () => {
    if (!intType || !intDate) return;
    onAddInteraction({
      type: intType,
      title: intTitle || undefined,
      description: intDesc || undefined,
      interaction_date: intDate,
    });
    setIntTitle('');
    setIntDesc('');
    setIntDate(new Date().toISOString().split('T')[0]);
    setShowInteractionForm(false);
  };

  const daysOverdue = (() => {
    if (!contact.contact_frequency_days) return null;
    if (!contact.last_contacted_at) return contact.contact_frequency_days;
    const last = new Date(contact.last_contacted_at);
    const due = new Date(last.getTime() + contact.contact_frequency_days * 86400000);
    const diff = Math.floor((Date.now() - due.getTime()) / 86400000);
    return diff > 0 ? diff : null;
  })();

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
            {contact.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{contact.name}</h2>
              <button onClick={onToggleFavorite} className="text-lg hover:scale-110 transition-transform" title="Toggle favorite">
                {contact.is_favorite ? '★' : '☆'}
              </button>
            </div>
            {contact.nickname && <div className="text-sm text-gray-500 dark:text-gray-400">"{contact.nickname}"</div>}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {contact.company && (
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {contact.job_title ? `${contact.job_title} at ${contact.company}` : contact.company}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${REL_COLORS[contact.relationship_type] || REL_COLORS.acquaintance}`}>
                {contact.relationship_type}
              </span>
            </div>
            {daysOverdue !== null && (
              <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded text-xs">
                <span>⏰</span> {daysOverdue} day{daysOverdue !== 1 ? 's' : ''} overdue for outreach
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onEdit} className="p-2 text-gray-400 hover:text-blue-500 transition-colors" title="Edit">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
            <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="Delete">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tags */}
        {contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {contact.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Info grid */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-700">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {contact.email && <InfoRow label="Email" value={contact.email} />}
          {contact.phone && <InfoRow label="Phone" value={contact.phone} />}
          {contact.website && <InfoRow label="Website" value={contact.website} />}
          {contact.location && <InfoRow label="Location" value={contact.location} />}
          {contact.birthday && <InfoRow label="Birthday" value={contact.birthday} />}
          {contact.contact_frequency_days && (
            <InfoRow label="Reach out every" value={`${contact.contact_frequency_days} days`} />
          )}
          {contact.last_contacted_at && <InfoRow label="Last contacted" value={contact.last_contacted_at.split('T')[0]} />}
        </div>
        {contact.how_met && (
          <div className="mt-4">
            <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">How we met</div>
            <div className="text-sm text-gray-700 dark:text-gray-300">{contact.how_met}</div>
          </div>
        )}
        {contact.notes && (
          <div className="mt-4">
            <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Notes</div>
            <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{contact.notes}</div>
          </div>
        )}
      </div>

      {/* Custom fields */}
      {contact.fields && contact.fields.length > 0 && (
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Custom Fields</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {contact.fields.map(f => (
              <InfoRow key={f.id} label={f.field_label} value={f.field_value} />
            ))}
          </div>
        </div>
      )}

      {/* Interactions */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Interactions</div>
          <button
            onClick={() => setShowInteractionForm(!showInteractionForm)}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Log Interaction
          </button>
        </div>

        {/* Add interaction form */}
        {showInteractionForm && (
          <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Type</label>
                <select
                  value={intType}
                  onChange={e => setIntType(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none"
                >
                  {INTERACTION_TYPES.map(t => (
                    <option key={t} value={t}>{INTERACTION_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Date</label>
                <input
                  type="date"
                  value={intDate}
                  onChange={e => setIntDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none"
                />
              </div>
            </div>
            <input
              type="text"
              value={intTitle}
              onChange={e => setIntTitle(e.target.value)}
              placeholder="Title (optional)"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none mb-2"
            />
            <textarea
              value={intDesc}
              onChange={e => setIntDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none resize-none mb-3"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowInteractionForm(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Cancel</button>
              <button onClick={handleSubmitInteraction} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
            </div>
          </div>
        )}

        {/* Interaction timeline */}
        {!contact.interactions || contact.interactions.length === 0 ? (
          <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No interactions logged yet</div>
        ) : (
          <div className="space-y-1">
            {contact.interactions.map(int => (
              <div key={int.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                <span className="text-base flex-shrink-0 mt-0.5">{INTERACTION_ICONS[int.type] || '📌'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{int.title || int.type}</span>
                    <span className="text-[10px] text-gray-400">{int.interaction_date}</span>
                  </div>
                  {int.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{int.description}</div>
                  )}
                </div>
                <button
                  onClick={() => onDeleteInteraction(int.id)}
                  className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  title="Delete interaction"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Info Row ─────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm text-gray-800 dark:text-gray-200 truncate">{value}</div>
    </div>
  );
}

// ── Contact Form (Create / Edit) ────────────────────────────────

function ContactForm({
  contact,
  onSave,
  onCancel,
}: {
  contact?: Contact;
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(contact?.name || '');
  const [nickname, setNickname] = useState(contact?.nickname || '');
  const [company, setCompany] = useState(contact?.company || '');
  const [jobTitle, setJobTitle] = useState(contact?.job_title || '');
  const [email, setEmail] = useState(contact?.email || '');
  const [phone, setPhone] = useState(contact?.phone || '');
  const [website, setWebsite] = useState(contact?.website || '');
  const [location, setLocation] = useState(contact?.location || '');
  const [birthday, setBirthday] = useState(contact?.birthday || '');
  const [howMet, setHowMet] = useState(contact?.how_met || '');
  const [notes, setNotes] = useState(contact?.notes || '');
  const [relType, setRelType] = useState(contact?.relationship_type || 'acquaintance');
  const [freqDays, setFreqDays] = useState(contact?.contact_frequency_days?.toString() || '');
  const [tagsStr, setTagsStr] = useState(contact?.tags?.join(', ') || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      nickname: nickname || null,
      company: company || null,
      job_title: jobTitle || null,
      email: email || null,
      phone: phone || null,
      website: website || null,
      location: location || null,
      birthday: birthday || null,
      how_met: howMet || null,
      notes: notes || null,
      relationship_type: relType,
      contact_frequency_days: freqDays ? parseInt(freqDays) : null,
      tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        {contact ? 'Edit Contact' : 'New Contact'}
      </h3>
      <div className="space-y-3">
        <FormInput label="Name *" value={name} onChange={setName} required />
        <FormInput label="Nickname" value={nickname} onChange={setNickname} />
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="Company" value={company} onChange={setCompany} />
          <FormInput label="Job Title" value={jobTitle} onChange={setJobTitle} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="Email" type="email" value={email} onChange={setEmail} />
          <FormInput label="Phone" value={phone} onChange={setPhone} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="Website" value={website} onChange={setWebsite} />
          <FormInput label="Location" value={location} onChange={setLocation} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="Birthday" type="date" value={birthday} onChange={setBirthday} />
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Relationship</label>
            <select
              value={relType}
              onChange={e => setRelType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none"
            >
              {RELATIONSHIP_TYPES.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        <FormInput label="Reach out every N days" type="number" value={freqDays} onChange={setFreqDays} placeholder="e.g. 30" />
        <FormInput label="How we met" value={howMet} onChange={setHowMet} />
        <FormInput label="Tags (comma-separated)" value={tagsStr} onChange={setTagsStr} placeholder="friend, startup, NYC" />
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none resize-none"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          Cancel
        </button>
        <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          {contact ? 'Save Changes' : 'Create Contact'}
        </button>
      </div>
    </form>
  );
}

// ── Form Input ──────────────────────────────────────────────────

function FormInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}
