import { useState } from 'react';
import { useDirectory } from '../../hooks/use-file-browser';

interface FileBrowserProps {
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
}

function DirectoryNode({
  path,
  name,
  depth,
  onFileSelect,
  selectedFile,
}: {
  path: string;
  name: string;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(depth === 0);
  const { data: entries } = useDirectory(path);

  return (
    <div>
      {depth > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm text-gray-300 hover:bg-gray-800"
          style={{ paddingLeft: `${depth * 16}px` }}
        >
          <span className="w-4 text-center text-xs text-gray-500">{expanded ? '▼' : '▶'}</span>
          <span className="text-yellow-400">📁</span>
          <span className="truncate">{name}</span>
        </button>
      )}
      {expanded &&
        entries?.map((entry) =>
          entry.isDirectory ? (
            <DirectoryNode
              key={entry.path}
              path={entry.path}
              name={entry.name}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              selectedFile={selectedFile}
            />
          ) : (
            <button
              key={entry.path}
              onClick={() => onFileSelect(entry.path)}
              className={`flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm ${
                selectedFile === entry.path
                  ? 'bg-blue-900/50 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
              style={{ paddingLeft: `${(depth + 1) * 16}px` }}
            >
              <span className="w-4" />
              <span className="text-gray-500">📄</span>
              <span className="truncate">{entry.name}</span>
            </button>
          ),
        )}
    </div>
  );
}

export default function FileBrowser({
  onFileSelect,
  selectedFile,
}: FileBrowserProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col overflow-y-auto border-r border-gray-800 bg-gray-900/50">
      <div className="border-b border-gray-800 px-3 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">
        Files
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        <DirectoryNode
          path="."
          name="root"
          depth={0}
          onFileSelect={onFileSelect}
          selectedFile={selectedFile}
        />
      </div>
    </div>
  );
}
