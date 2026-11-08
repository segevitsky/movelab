/**
 * Write a workout package to a file and hand it to the share sheet (WhatsApp, AirDrop, mail, Files…), and
 * read one back from a file URL the system opened us with (file:// on iOS, content:// on Android).
 */
import { File, Paths } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { packageFileName, parseWorkoutPackage, WORKOUT_FILE_MIME, WORKOUT_FILE_UTI, type WorkoutPackage } from '../db/workoutPackage';

/** Written at the Documents root (visible in Files ▸ On My iPhone ▸ MoveLab). `displayName` names the file. */
export async function writeWorkoutFile(p: WorkoutPackage, displayName?: string | null, base = Paths.document): Promise<File> {
  const file = new File(base, packageFileName(displayName ?? p.workout.name));
  if (file.exists) file.delete();
  await file.write(JSON.stringify(p)); // write() is async in this SDK — un-awaited, the share saw no file (2026-11-08)
  if (!file.exists) throw new Error(`Could not write ${file.uri}`);
  return file;
}

/** Export + open the share sheet. Resolves when the sheet closes. */
export async function shareWorkoutFile(p: WorkoutPackage, displayName?: string | null) {
  const title = displayName ?? p.workout.name ?? 'Workout';
  const file = await writeWorkoutFile(p, title);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(file.uri, { mimeType: WORKOUT_FILE_MIME, UTI: WORKOUT_FILE_UTI, dialogTitle: title });
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
