import { useState } from 'react';
import { useCurrentWorkspace, useOpenWorkspace } from '../hooks/use-workspace';
import FileBrowser from '../components/workspace/file-browser';
import EditorPane from '../components/workspace/editor-pane';

export default function WorkspacePage(): React.JSX.Element {
  const { data: workspace, isLoading } = useCurrentWorkspace();
  const openWorkspace = useOpenWorkspace();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <p>Loading...</p>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <h2 className="mb-2 text-2xl font-bold text-white">Open a Workspace</h2>
        <p className="mb-6 max-w-md text-center text-gray-400">
          Select a directory to start a SWOT analysis workspace. This is where your stakeholder
          profiles and notes live.
        </p>
        <button
          onClick={() => openWorkspace.mutate()}
          disabled={openWorkspace.isPending}
          className="rounded bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {openWorkspace.isPending ? 'Opening...' : 'Open Workspace'}
        </button>
        {openWorkspace.isError && (
          <p className="mt-4 text-sm text-red-400">{openWorkspace.error.message}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 pb-3">
        <div>
          <h2 className="text-lg font-bold text-white">{workspace.name}</h2>
          <p className="text-sm text-gray-500">{workspace.path}</p>
        </div>
        <button
          onClick={() => openWorkspace.mutate()}
          disabled={openWorkspace.isPending}
          className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-white"
        >
          Switch Workspace
        </button>
      </div>
      <div className="mt-3 flex flex-1 overflow-hidden rounded-lg border border-gray-800">
        <div className="w-64 shrink-0">
          <FileBrowser onFileSelect={setSelectedFile} selectedFile={selectedFile} />
        </div>
        <div className="flex-1">
          <EditorPane filePath={selectedFile} />
        </div>
      </div>
    </div>
  );
}
