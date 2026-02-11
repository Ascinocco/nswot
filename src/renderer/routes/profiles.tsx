import { useState } from 'react';
import { useCurrentWorkspace } from '../hooks/use-workspace';
import {
  useProfiles,
  useCreateProfile,
  useUpdateProfile,
  useDeleteProfile,
  useImportDirectory,
} from '../hooks/use-profiles';
import { useDirectory } from '../hooks/use-file-browser';
import ProfileCard from '../components/profiles/profile-card';
import ProfileForm from '../components/profiles/profile-form';

export default function ProfilesPage(): React.JSX.Element {
  const { data: workspace } = useCurrentWorkspace();
  const { data: profiles, isLoading } = useProfiles(!!workspace);
  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();
  const deleteProfile = useDeleteProfile();
  const importDirectory = useImportDirectory();

  const [showForm, setShowForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
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

  function handleImportDir(dirPath: string): void {
    importDirectory.mutate(dirPath, {
      onSuccess: (imported) => {
        setShowImport(false);
        alert(`Imported ${imported.length} profile${imported.length !== 1 ? 's' : ''} successfully.`);
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
            Import from Directory
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
        <ImportDirectoryPicker
          onSelect={handleImportDir}
          onClose={() => setShowImport(false)}
          isLoading={importDirectory.isPending}
          error={importDirectory.isError ? importDirectory.error : null}
        />
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
            Add a profile manually or import from a directory of markdown files.
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

function ImportDirectoryPicker({
  onSelect,
  onClose,
  isLoading,
  error,
}: {
  onSelect: (dirPath: string) => void;
  onClose: () => void;
  isLoading: boolean;
  error: Error | null;
}): React.JSX.Element {
  const [currentPath, setCurrentPath] = useState('.');
  const { data: entries, isLoading: dirLoading } = useDirectory(currentPath);

  const dirs = entries?.filter((e) => e.isDirectory) ?? [];
  const mdFiles = entries?.filter((e) => !e.isDirectory && e.name.endsWith('.md')) ?? [];

  // Build breadcrumb parts from currentPath
  const pathParts = currentPath === '.' ? [] : currentPath.split('/');

  return (
    <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-bold text-gray-200">
          Select a directory to import all .md files
        </h4>
        <button
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          Cancel
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="mb-2 flex items-center gap-1 text-xs text-gray-500">
        <button
          onClick={() => setCurrentPath('.')}
          className="hover:text-blue-400"
        >
          workspace
        </button>
        {pathParts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <span>/</span>
            <button
              onClick={() => setCurrentPath(pathParts.slice(0, i + 1).join('/'))}
              className="hover:text-blue-400"
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {/* Directory listing */}
      <div className="max-h-48 overflow-y-auto rounded border border-gray-800 bg-gray-950 p-1">
        {dirLoading && <p className="p-2 text-xs text-gray-500">Loading...</p>}

        {dirs.map((dir) => (
          <button
            key={dir.path}
            onClick={() => setCurrentPath(dir.path)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-800"
          >
            <span className="text-yellow-400">📁</span>
            <span>{dir.name}</span>
          </button>
        ))}

        {mdFiles.length > 0 && (
          <div className="mt-1 border-t border-gray-800 pt-1">
            {mdFiles.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-2 px-2 py-1 text-xs text-gray-500"
              >
                <span>📄</span>
                <span>{file.name}</span>
              </div>
            ))}
          </div>
        )}

        {!dirLoading && dirs.length === 0 && mdFiles.length === 0 && (
          <p className="p-2 text-xs text-gray-500">No subdirectories or markdown files here.</p>
        )}
      </div>

      {/* Info + action */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {mdFiles.length > 0
            ? `${mdFiles.length} markdown file${mdFiles.length !== 1 ? 's' : ''} in this directory`
            : 'No markdown files in this directory'}
        </span>
        <button
          onClick={() => onSelect(currentPath)}
          disabled={isLoading || mdFiles.length === 0}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Importing...' : `Import ${mdFiles.length} file${mdFiles.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-400">{error.message}</p>
      )}
    </div>
  );
}
