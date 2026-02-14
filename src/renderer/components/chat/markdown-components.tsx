import type { Components } from 'react-markdown';

/**
 * Shared react-markdown component overrides.
 * Opens all links in the OS default browser via target="_blank",
 * which Electron's setWindowOpenHandler intercepts with shell.openExternal.
 */
export const markdownComponents: Components = {
  a: ({ href, children, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
};
