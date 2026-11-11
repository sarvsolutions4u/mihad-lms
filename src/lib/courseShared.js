/** Shared between the server and the course pages. */

export const FEEDBACK_TAGS = [
  'Clear pronunciation',
  'Good fluency',
  'Good vocabulary',
  'Confident',
  'Work on pronunciation',
  'Work on grammar',
  'Speak more slowly',
  'Use full sentences',
  'Add more detail',
];

export const ITEM_KINDS = {
  conversation: { label: 'Conversation', icon: 'chat', hint: 'Listen and role-play' },
  audio: { label: 'Listening', icon: 'headphones', hint: 'Audio file' },
  file: { label: 'Reading', icon: 'file', hint: 'PDF / Word' },
  notes: { label: 'Notes', icon: 'book', hint: 'Phrases and tips' },
  speaking: { label: 'Speaking task', icon: 'mic', hint: 'Record — trainer feedback' },
};

/** "A: Hello\nB: Hi" → lines (for pasting a conversation in the editor) */
export function parseScript(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^([^:]{1,30}):\s*(.+)$/);
      return m ? { speaker: m[1].trim(), text: m[2].trim() } : { speaker: '', text: l };
    });
}

export const linesToScript = (lines) => (lines || []).map((l) => (l.speaker ? `${l.speaker}: ${l.text}` : l.text)).join('\n');
