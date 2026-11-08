/**
 * Write a workout package to a file and hand it to the share sheet (WhatsApp, AirDrop, mail, Files…), and
 * read one back from a file URL the system opened us with (file:// on iOS, content:// on Android).
 */
import { File, Paths } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { packageFileName, parseWorkoutPackage, WORKOUT_FILE_MIME, WORKOUT_FILE_UTI, type WorkoutPackage } from '../db/workoutPackage';

/** Written at the Documents root (visible in Files ▸ On My iPhone ▸ MoveLab), like the library export that shares fine. */
export async function writeWorkoutFile(p: WorkoutPackage, base = Paths.document): Promise<File> {
  const file = new File(base, packageFileName(p.workout.name));
  if (file.exists) file.delete();
  file.write(JSON.stringify(p));
  return file;
}

/** Export + open the share sheet. Resolves when the sheet closes. */
export async function shareWorkoutFile(p: WorkoutPackage) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  const title = p.workout.name ?? 'Workout';
  let file = await writeWorkoutFile(p);
  try {
    await Sharing.shareAsync(file.uri, { mimeType: WORKOUT_FILE_MIME, UTI: WORKOUT_FILE_UTI, dialogTitle: title });
  } catch (e) {
    // expo-sharing refused the Documents file: retry from the cache folder (the GIF export shares from there)
    file = await writeWorkoutFile(p, Paths.cache);
    try {
      await Sharing.shareAsync(file.uri, { mimeType: WORKOUT_FILE_MIME, UTI: WORKOUT_FILE_UTI, dialogTitle: title });
    } catch (e2) {
      throw new Error(`${String((e2 as Error)?.message ?? e2)}\n${file.uri} (exists: ${file.exists})`);
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
