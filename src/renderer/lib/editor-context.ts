import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import React from 'react';

interface EditorContextState {
  filePath: string | null;
  contentPreview: string | null;
  selectedText: string | null;
}

interface EditorContextValue extends EditorContextState {
  setFilePath: (path: string | null) => void;
  setContentPreview: (content: string | null) => void;
  setSelectedText: (text: string | null) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

const MAX_PREVIEW_LENGTH = 500;

export function EditorContextProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<EditorContextState>({
    filePath: null,
    contentPreview: null,
    selectedText: null,
  });

  const setFilePath = useCallback((path: string | null) => {
    setState((prev) => ({ ...prev, filePath: path, selectedText: null }));
  }, []);

  const setContentPreview = useCallback((content: string | null) => {
    const preview = content && content.length > MAX_PREVIEW_LENGTH
      ? content.slice(0, MAX_PREVIEW_LENGTH) + '...'
      : content;
    setState((prev) => ({ ...prev, contentPreview: preview }));
  }, []);

  const setSelectedText = useCallback((text: string | null) => {
    setState((prev) => ({ ...prev, selectedText: text }));
  }, []);

  // Sync to main process whenever state changes
  useEffect(() => {
    const context = state.filePath
      ? { filePath: state.filePath, contentPreview: state.contentPreview, selectedText: state.selectedText }
      : null;
    window.nswot.chat.setEditorContext(context);
  }, [state.filePath, state.contentPreview, state.selectedText]);

  const value: EditorContextValue = {
    ...state,
    setFilePath,
    setContentPreview,
    setSelectedText,
  };

  return React.createElement(EditorContext.Provider, { value }, children);
}

const NOOP = (): void => {};

const DEFAULT_CONTEXT: EditorContextValue = {
  filePath: null,
  contentPreview: null,
  selectedText: null,
  setFilePath: NOOP,
  setContentPreview: NOOP,
  setSelectedText: NOOP,
};

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorContext);
  return ctx ?? DEFAULT_CONTEXT;
}
