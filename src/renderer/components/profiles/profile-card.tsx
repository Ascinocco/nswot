interface ProfileCardProps {
  profile: Profile;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ProfileCard({
  profile,
  onEdit,
  onDelete,
}: ProfileCardProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="font-medium text-white">{profile.name}</h3>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-400">
            {profile.role && <span>{profile.role}</span>}
            {profile.role && profile.team && <span>·</span>}
            {profile.team && <span>{profile.team}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {profile.interviewQuotes.length > 0 && (
            <span className="rounded-full bg-blue-900/50 px-2 py-0.5 text-xs text-blue-300">
              {profile.interviewQuotes.length} quote{profile.interviewQuotes.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      {profile.concerns && (
        <p className="mb-2 text-sm text-gray-400 line-clamp-2">{profile.concerns}</p>
      )}
      <div className="flex items-center gap-2 border-t border-gray-800 pt-3">
        <button
          onClick={onEdit}
          className="rounded px-3 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="rounded px-3 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-900/30 hover:text-red-300"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
