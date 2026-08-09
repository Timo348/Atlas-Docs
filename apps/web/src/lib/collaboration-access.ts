export type CollaborationAccessState = {
  documentId: string;
  serverReadOnly: boolean | null;
  initialSyncComplete: boolean;
};

export function createCollaborationAccessState(documentId: string): CollaborationAccessState {
  return {
    documentId,
    serverReadOnly: null,
    initialSyncComplete: false,
  };
}

export function applyCollaborationPermission(
  state: CollaborationAccessState,
  documentId: string,
  serverReadOnly: boolean,
): CollaborationAccessState {
  if (state.documentId !== documentId) return state;
  return { ...state, serverReadOnly };
}

export function completeInitialCollaborationSync(
  state: CollaborationAccessState,
  documentId: string,
): CollaborationAccessState {
  if (state.documentId !== documentId || state.initialSyncComplete) return state;
  return { ...state, initialSyncComplete: true };
}

export function collaborationIsReadOnly(
  state: CollaborationAccessState,
  documentId: string,
): boolean {
  return state.documentId !== documentId
    || state.serverReadOnly !== false
    || !state.initialSyncComplete;
}
