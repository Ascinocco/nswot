import { useState } from 'react';
import { useCurrentWorkspace } from '../hooks/use-workspace';
import {
  useProfiles,
  useCreateProfile,
  useUpdateProfile,
  useDeleteProfile,
  useImportProfiles,
} from '../hooks/use-profiles';
import ProfileCard from '../components/profiles/profile-card';
import ProfileForm from '../components/profiles/profile-form';

export default function ProfilesPage(): React.JSX.Element {
  const { data: workspace } = useCurrentWorkspace();
  const { data: profiles, isLoading } = useProfiles(!!workspace);
  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();
  const deleteProfile = useDeleteProfile();
  const importProfiles = useImportProfiles();

  const [showForm, setShowForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [importPath, setImportPath] = useState('');
  const [showImport, setShowImport] = useState(false);

  if (!workspace) {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold">Profiles</h2>
        <p className="text-gray-400">Open a workspace first to manage stakeholder profiles.</p>
      </div>
    );
  }

  function handleCreate(input: ProfileInput): void {
    createProfile.mutate(input, {
      onSuccess: () => {
        setShowForm(false);
      },
    });
  }

  function handleUpdate(input: ProfileInput): void {
    if (!editingProfile) return;
    updateProfile.mutate(
      { id: editingProfile.id, input },
      {
        onSuccess: () => {
          setEditingProfile(null);
        },
      },
    );
  }

  function handleDelete(id: string): void {
    if (!confirm('Are you sure you want to delete this profile?')) return;
    deleteProfile.mutate(id);
  }

  function handleImport(): void {
    if (!importPath.trim()) return;
    importProfiles.mutate(importPath.trim(), {
      onSuccess: () => {
        setImportPath('');
        setShowImport(false);
      },
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Profiles</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(!showImport)}
            className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-white"
          >
            Import from Markdown
          </button>
          <button
            onClick={() => {
              setEditingProfile(null);
              setShowForm(true);
            }}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            Add Profile
          </button>
        </div>
      </div>

      {showImport && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900 p-3">
          <input
            type="text"
            value={importPath}
            onChange={(e) => setImportPath(e.target.value)}
            placeholder="Relative path to markdown file (e.g., profiles/jane.md)"
            className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleImport}
            disabled={importProfiles.isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {importProfiles.isPending ? 'Importing...' : 'Import'}
          </button>
          <button
            onClick={() => setShowImport(false)}
            className="rounded px-2 py-2 text-gray-500 hover:text-white"
          >
            ×
          </button>
          {importProfiles.isError && (
            <span className="text-sm text-red-400">{importProfiles.error.message}</span>
          )}
        </div>
      )}

      {createProfile.isError && (
        <div className="mb-4 rounded border border-red-900 bg-red-900/20 p-3 text-sm text-red-400">
          {createProfile.error.message}
        </div>
      )}

      {(showForm || editingProfile) && (
        <div className="mb-6 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-4 text-lg font-medium text-white">
            {editingProfile ? 'Edit Profile' : 'New Profile'}
          </h3>
          <ProfileForm
            initialData={
              editingProfile
                ? {
                    name: editingProfile.name,
                    role: editingProfile.role ?? undefined,
                    team: editingProfile.team ?? undefined,
                    concerns: editingProfile.concerns ?? undefined,
                    priorities: editingProfile.priorities ?? undefined,
                    interviewQuotes: editingProfile.interviewQuotes,
                    notes: editingProfile.notes ?? undefined,
                  }
                : undefined
            }
            onSubmit={editingProfile ? handleUpdate : handleCreate}
            onCancel={() => {
              setShowForm(false);
              setEditingProfile(null);
            }}
            isSubmitting={createProfile.isPending || updateProfile.isPending}
          />
        </div>
      )}

      {isLoading && <p className="text-gray-500">Loading profiles...</p>}

      {profiles && profiles.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-gray-700 p-8 text-center">
          <p className="text-gray-400">No profiles yet.</p>
          <p className="mt-1 text-sm text-gray-500">
            Add a profile manually or import from a markdown file.
          </p>
        </div>
      )}

      {profiles && profiles.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              onEdit={() => {
                setShowForm(false);
                setEditingProfile(profile);
              }}
              onDelete={() => handleDelete(profile.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
