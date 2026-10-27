/** Shared by the browser (file picker) and the server (upload check). */
export const MAX_FILE_MB = 4;
export const ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf,.odt,.png,.jpg,.jpeg,.gif,.webp,.heic,.mp3,.m4a,.wav,.mp4,.zip';

export const isStoredFile = (url) => /^\/api\/files\/[a-f0-9]{32}/.test(String(url || ''));
export const downloadUrl = (url) => (isStoredFile(url) ? `${url.split('?')[0]}?download=1` : url);

export function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
