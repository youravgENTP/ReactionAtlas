import type { BackupStatus, Collection, Component, Drug, DrugImportInput, DrugImportResult, LatexShortcut, MediaAsset, Reaction, ReactionInput, ReactionRichTextInput } from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  })
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try { message = (await response.json()).detail ?? message } catch { /* response was not JSON */ }
    throw new Error(message)
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export const api = {
  reactions: (search = '') => request<Reaction[]>(`/api/reactions?search=${encodeURIComponent(search)}`),
  components: (search = '') => request<Component[]>(`/api/components?search=${encodeURIComponent(search)}`),
  createReaction: (data: ReactionInput) => request<Reaction>('/api/reactions', { method: 'POST', body: JSON.stringify(data) }),
  updateReaction: (id: number, data: ReactionInput) => request<Reaction>(`/api/reactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateReactionRichText: (id: number, data: ReactionRichTextInput) => request<Reaction>(`/api/reactions/${id}/rich-text`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteReaction: (id: number) => request<void>(`/api/reactions/${id}`, { method: 'DELETE' }),
  collections: () => request<Collection[]>('/api/collections'),
  createCollection: (data: { title: string; description: string | null; markdown_content: string }) =>
    request<Collection>('/api/collections', { method: 'POST', body: JSON.stringify(data) }),
  updateCollection: (id: number, data: { title: string; description: string | null; markdown_content: string }) =>
    request<Collection>(`/api/collections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCollection: (id: number) => request<void>(`/api/collections/${id}`, { method: 'DELETE' }),
  addReaction: (collectionId: number, reactionId: number) => request<Collection>(`/api/collections/${collectionId}/reactions`, {
    method: 'POST', body: JSON.stringify({ reaction_id: reactionId }),
  }),
  removeReaction: (collectionId: number, reactionId: number) => request<Collection>(`/api/collections/${collectionId}/reactions/${reactionId}`, { method: 'DELETE' }),
  reorder: (collectionId: number, reactionIds: number[]) => request<Collection>(`/api/collections/${collectionId}/reorder`, {
    method: 'PUT', body: JSON.stringify({ reaction_ids: reactionIds }),
  }),
  importReactions: (data: ReactionInput[]) => request<{ created: number; updated: number }>('/api/import', { method: 'POST', body: JSON.stringify(data) }),
  latexShortcuts: () => request<LatexShortcut[]>('/api/settings/latex-shortcuts'),
  saveLatexShortcuts: (data: LatexShortcut[]) => request<LatexShortcut[]>('/api/settings/latex-shortcuts', { method: 'PUT', body: JSON.stringify(data) }),
  backupStatus: () => request<BackupStatus>('/api/backups/status'),
  createBackup: () => request<BackupStatus>('/api/backups', { method: 'POST' }),
  drugs: () => request<Drug[]>('/api/drugs'),
  importDrugs: (data: DrugImportInput[]) => request<DrugImportResult>('/api/drugs/import', { method: 'POST', body: JSON.stringify(data) }),
  uploadImage: async (file: File) => {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image(); const url = URL.createObjectURL(file)
      image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }) }
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')) }; image.src = url
    })
    return request<MediaAsset>('/api/media', { method: 'POST', body: file, headers: {
      'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name),
      'X-Image-Width': String(dimensions.width), 'X-Image-Height': String(dimensions.height),
    } })
  },
}
