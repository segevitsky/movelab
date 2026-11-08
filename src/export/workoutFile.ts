/**
 * Write a workout package to a file and hand it to the share sheet (WhatsApp, AirDrop, mail, Files…), and
 * read one back from a file URL the system opened us with (file:// on iOS, content:// on Android).
 */
import { Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { packageFileName, parseWorkoutPackage, WORKOUT_FILE_MIME, WORKOUT_FILE_UTI, type WorkoutPackage } from '../db/workoutPackage';

/** Written at the Documents root (visible in Files ▸ On My iPhone ▸ MoveLab). `displayName` names the file. */
export async function writeWorkoutFile(p: WorkoutPackage, displayName?: string | null, base = Paths.document): Promise<File> {
  const file = new File(base, packageFileName(displayName ?? p.workout.name));
  if (file.exists) file.delete();
  file.write(JSON.stringify(p));
  return file;
}

/**
 * Export + open the share sheet. Resolves when the sheet closes. iOS: expo-sharing first; if it refuses the
 * file ("You don't have access to the provided file", seen 2026-11-08 on a file that existed in Caches), React
 * Native's own Share hands the same URL to UIActivityViewController without that check.
 */
export async function shareWorkoutFile(p: WorkoutPackage, displayName?: string | null) {
  const title = displayName ?? p.workout.name ?? 'Workout';
  const file = await writeWorkoutFile(p, title);
  try {
    if (!(await Sharing.isAvailableAsync())) throw new Error('expo-sharing unavailable');
    await Sharing.shareAsync(file.uri, { mimeType: WORKOUT_FILE_MIME, UTI: WORKOUT_FILE_UTI, dialogTitle: title });
  } catch (e) {
    if (Platform.OS !== 'ios') throw e;
    try {
      await Share.share({ url: file.uri, title }, { subject: title });
    } catch (e2) {
      throw new Error(`${String((e as Error)?.message ?? e)}\nthen: ${String((e2 as Error)?.message ?? e2)}\n${file.uri} (exists: ${file.exists})`);
    }
  }
}

/** Read and check a package from a URL the OS handed us. */
export async function readWorkoutFile(uri: string): Promise<WorkoutPackage> {
  let text: string;
  if (uri.startsWith('file://')) {
    text = await new File(uri).text();
  } else {
    // Android content:// (WhatsApp, Gmail, Files): only the legacy API reads provider URIs
    text = await FileSystemLegacy.readAsStringAsync(uri);
  }
  return parseWorkoutPackage(text);
}
