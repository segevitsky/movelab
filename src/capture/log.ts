import { File, Paths } from 'expo-file-system';

/** One attempt per reel, for the Phase 0 acceptance table (≥ 10 reels). */
export type CaptureAttempt = {
  at: string; // ISO
  url: string;
  code: string;
  embedLoaded: boolean; // page loaded without error
  videoFound: boolean; // a <video> element appeared
  username: string | null;
  captionChars: number;
  bodyText: string; // first chars of page text (shows login walls / "unavailable")
  ua?: 'mobile' | 'desktop'; // user agent that produced videoFound
  mode?: 'embed' | 'page';
  recorded: boolean;
  recordingUri?: string;
  recordingSeconds?: number;
  mpDetectedPct?: number;
  mpMs?: number;
  visionDetectedPct?: number;
  visionMs?: number;
  note?: string;
};

const file = () => new File(Paths.document, 'phase0-capture-log.json');

export async function readLog(): Promise<CaptureAttempt[]> {
  const f = file();
  if (!f.exists) return [];
  try {
    return JSON.parse(await f.text()) as CaptureAttempt[];
  } catch {
    return [];
  }
}

export async function upsertAttempt(a: CaptureAttempt) {
  const all = await readLog();
  const i = all.findIndex((x) => x.code === a.code);
  if (i >= 0) all[i] = { ...all[i], ...a };
  else all.push(a);
  const f = file();
  if (!f.exists) f.create();
  await f.write(JSON.stringify(all, null, 1));
}

export async function patchAttempt(code: string, patch: Partial<CaptureAttempt>) {
  const all = await readLog();
  const i = all.findIndex((x) => x.code === code);
  if (i < 0) return;
  all[i] = { ...all[i], ...patch };
  await file().write(JSON.stringify(all, null, 1));
}

export function logFileUri() {
  return file().uri;
}
