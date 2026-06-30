/**
 * URI-like value containing the filesystem path used by VS Code APIs.
 */
export interface WorkspaceUriRef {
  /** Filesystem path for the workspace resource. */
  fsPath: string;
}

/**
 * Workspace folder-like value used by VS Code APIs.
 */
export interface WorkspaceFolderRef {
  /** Folder URI. */
  uri: WorkspaceUriRef;
}

/**
 * Minimal VS Code workspace shape needed to decide session identity.
 */
export interface WorkspaceRef {
  /** Workspace file URI for a `.code-workspace` window. */
  workspaceFile?: WorkspaceUriRef;
  /** Open workspace folders for a folder or multi-root window. */
  workspaceFolders?: readonly WorkspaceFolderRef[];
}

/**
 * Resolves the identifier stored on session rows for the current VS Code window.
 *
 * @param workspace - VS Code workspace-like object.
 * @returns Workspace file path, first folder path, or `undefined` for empty windows.
 */
export function resolveWorkspaceId(
  workspace: WorkspaceRef,
): string | undefined {
  return (
    workspace.workspaceFile?.fsPath ??
    workspace.workspaceFolders?.[0]?.uri.fsPath
  );
}
