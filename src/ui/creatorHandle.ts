/** Pure helpers for the creator handle in exercise names ("Push 1 · @coach"). UI in ./CreatorName.tsx. */
const HANDLE = /^(.*?)\s*[·\-–]\s*@([A-Za-z0-9_.]+)\s*$/;

/** Split "name · @handle" into the name and the creator handle (null when there is none). */
export function splitCreator(name: string): { base: string; handle: string | null } {
  const m = HANDLE.exec(name);
  return m ? { base: m[1], handle: m[2] } : { base: name, handle: null };
}

export function creatorUrl(handle: string) {
  return `https://www.instagram.com/${handle.replace(/\.+$/, '')}/`;
}
