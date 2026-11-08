/**
 * Write a workout package to a file and hand it to the share sheet (WhatsApp, AirDrop, mail, Files…), and
 * read one back from a file URL the system opened us with (file:// on iOS, content:// on Android).
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { packageFileName, parseWorkoutPackage, WORKOUT_FILE_MIME, WORKOUT_FILE_UTI, type WorkoutPackage } from '../db/workoutPackage';

export async function writeWorkoutFile(p: WorkoutPackage): Promise<File> {
  const dir = new Directory(Paths.document, 'shared');
  if (!dir.exists) dir.create();
  const file = new File(dir, packageFileName(p.workout.name));
  if (file.exists) file.delete();
  file.write(JSON.stringify(p));
  return file;
}

/** Export + open the share sheet. Resolves when the sheet closes. */
export async function shareWorkoutFile(p: WorkoutPackage) {
  const file = await writeWorkoutFile(p);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(file.uri, { mimeType: WORKOUT_FILE_MIME, UTI: WORKOUT_FILE_UTI, dialogTitle: p.workout.name ?? 'Workout' });
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
