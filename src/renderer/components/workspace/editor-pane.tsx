import { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useFileContent, useSaveFile } from '../../hooks/use-file-browser';

interface EditorPaneProps {
  filePath: string | null;
}

function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    sql: 'sql',
    sh: 'shell',
    py: 'python',
  };
  return languageMap[ext ?? ''] ?? 'plaintext';
}

export default function EditorPane({ filePath }: EditorPaneProps): React.JSX.Element {
  const { data: content, isLoading } = useFileContent(filePath);
  const saveFile = useSaveFile();
  const [editorValue, setEditorValue] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (content !== undefined) {
      setEditorValue(content);
      setIsDirty(false);
    }
  }, [content]);

  const handleSave = useCallback(() => {
    if (filePath && isDirty) {
      saveFile.mutate({ path: filePath, content: editorValue });
      setIsDirty(false);
    }
  }, [filePath, isDirty, editorValue, saveFile]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave]);

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <p>Select a file to edit</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <span className="text-sm text-gray-400">{filePath}</span>
        <div className="flex items-center gap-2">
          {isDirty && <span className="text-xs text-yellow-500">Unsaved</span>}
          <button
            onClick={handleSave}
            disabled={!isDirty || saveFile.isPending}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {saveFile.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      <div className="flex-1">
        <Editor
          value={editorValue}
          language={getLanguage(filePath)}
          theme="vs-dark"
          onChange={(value) => {
            setEditorValue(value ?? '');
            setIsDirty(true);
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
