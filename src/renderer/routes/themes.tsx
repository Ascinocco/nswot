import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useThemes, useUpdateTheme, useDeleteTheme } from '../hooks/use-themes';

const SOURCE_TYPE_LABELS: Record<string, string> = {
  profile: 'Profile',
  jira: 'Jira',
  confluence: 'Confluence',
  github: 'GitHub',
  codebase: 'Codebase',
};

const SOURCE_TYPE_STYLES: Record<string, string> = {
  profile: 'bg-blue-900/30 text-blue-300 border-blue-700',
  jira: 'bg-indigo-900/30 text-indigo-300 border-indigo-700',
  confluence: 'bg-teal-900/30 text-teal-300 border-teal-700',
  github: 'bg-purple-900/30 text-purple-300 border-purple-700',
  codebase: 'bg-amber-900/30 text-amber-300 border-amber-700',
};

export default function ThemesPage(): React.JSX.Element {
  const { analysisId } = useParams<{ analysisId: string }>();
  const navigate = useNavigate();
  const { data: themes, isLoading } = useThemes(analysisId ?? null);
  const updateTheme = useUpdateTheme(analysisId ?? '');
  const deleteTheme = useDeleteTheme(analysisId ?? '');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const startEdit = useCallback((theme: Theme) => {
    setEditingId(theme.id);
    setEditLabel(theme.label);
    setEditDescription(theme.description);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditLabel('');
    setEditDescription('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    await updateTheme.mutateAsync({
      id: editingId,
      fields: { label: editLabel, description: editDescription },
    });
    setEditingId(null);
  }, [editingId, editLabel, editDescription, updateTheme]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('Delete this theme? This cannot be undone.')) return;
      await deleteTheme.mutateAsync(id);
      if (expandedId === id) setExpandedId(null);
      if (editingId === id) cancelEdit();
    },
    [deleteTheme, expandedId, editingId, cancelEdit],
  );

  if (!analysisId) {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold">Themes</h2>
        <p className="text-gray-400">No analysis selected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded px-2 py-1 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            Back
          </button>
          <h2 className="text-2xl font-bold">Themes</h2>
        </div>
        {themes && (
          <span className="text-sm text-gray-500">{themes.length} theme{themes.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {isLoading && <p className="text-gray-500">Loading themes...</p>}

      {themes && themes.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-700 p-8 text-center">
          <p className="text-gray-400">No themes found for this analysis.</p>
          <p className="mt-1 text-sm text-gray-500">
            Themes are generated during analysis. Run an analysis to generate themes.
          </p>
        </div>
      )}

      {themes && themes.length > 0 && (
        <div className="space-y-3">
          {themes.map((theme) => {
            const isEditing = editingId === theme.id;
            const isExpanded = expandedId === theme.id;

            return (
              <div
                key={theme.id}
                className={`rounded-lg border bg-gray-900 p-4 transition-colors ${
                  isExpanded ? 'border-blue-700' : 'border-gray-800'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-xs text-gray-400">Label</label>
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-600 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-gray-400">Description</label>
                          <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            rows={3}
                            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-600 focus:outline-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={saveEdit}
                            disabled={updateTheme.isPending}
                            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                          >
                            {updateTheme.isPending ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded border border-gray-700 px-3 py-1 text-xs text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : theme.id)}
                          className="text-left"
                        >
                          <h3 className="text-sm font-medium text-gray-100">{theme.label}</h3>
                          <p className="mt-1 text-sm text-gray-400">{theme.description}</p>
                        </button>

                        {/* Source type badges + frequency */}
                        <div className="mt-2 flex items-center gap-2">
                          {theme.sourceTypes.map((st) => (
                            <span
                              key={st}
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                SOURCE_TYPE_STYLES[st] ?? 'bg-gray-800 text-gray-400 border-gray-700'
                              }`}
                            >
                              {SOURCE_TYPE_LABELS[st] ?? st}
                            </span>
                          ))}
                          <span className="text-xs text-gray-500">
                            {theme.frequency} mention{theme.frequency !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  {!isEditing && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(theme)}
                        className="rounded px-2 py-1 text-xs text-blue-400 transition-colors hover:bg-blue-900/30 hover:text-blue-300"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(theme.id)}
                        disabled={deleteTheme.isPending}
                        className="rounded px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-900/30 hover:text-red-300 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded evidence */}
                {isExpanded && !isEditing && theme.evidenceRefs.length > 0 && (
                  <div className="mt-4 border-t border-gray-800 pt-3">
                    <h4 className="mb-2 text-xs font-medium text-gray-400">
                      Evidence ({theme.evidenceRefs.length})
                    </h4>
                    <div className="space-y-2">
                      {theme.evidenceRefs.map((ref, idx) => (
                        <div
                          key={idx}
                          className="rounded border border-gray-800 bg-gray-950 p-3"
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                SOURCE_TYPE_STYLES[ref.sourceType] ??
                                'bg-gray-800 text-gray-400 border-gray-700'
                              }`}
                            >
                              {SOURCE_TYPE_LABELS[ref.sourceType] ?? ref.sourceType}
                            </span>
                            <span className="text-xs text-gray-600">{ref.sourceId}</span>
                          </div>
                          <p className="text-sm italic text-gray-300">"{ref.quote}"</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Update error */}
                {updateTheme.isError && editingId === theme.id && (
                  <div className="mt-2 rounded border border-red-800 bg-red-900/20 p-2">
                    <p className="text-xs text-red-300">
                      {updateTheme.error instanceof Error ? updateTheme.error.message : 'Update failed'}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete error */}
      {deleteTheme.isError && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3">
          <p className="text-sm text-red-300">
            {deleteTheme.error instanceof Error ? deleteTheme.error.message : 'Delete failed'}
          </p>
        </div>
      )}
    </div>
  );
}
