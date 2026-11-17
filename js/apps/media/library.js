/*
 * apps/media/library.js — real audio files for the player, as data.
 *
 * Put each file in the music/ folder at the path listed in `src`. A track
 * only appears in the playlist if its file is actually there, so a missing
 * file never leaves a dead entry. `bpm` is shown in the list as metadata;
 * file playback doesn't need it.
 *
 * Only add audio you have the right to publish: files in music/ are served
 * to every visitor of the deployed site. (Visitors can also open their own
 * files from the player's "Open file…" button; those never leave their
 * computer and are not hosted.)
 */

export const FILE_TRACKS = [
  { name: 'Paranoid Android', artist: 'Radiohead', bpm: 164, src: 'music/paranoid-android.mp3' },
];

async function exists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return response.ok;
  } catch (e) {
    return false;                              // offline or file://
  }
}

/** The subset of FILE_TRACKS whose files are published. */
export async function availableFileTracks() {
  const checks = await Promise.all(FILE_TRACKS.map((track) => exists(track.src)));
  return FILE_TRACKS.filter((_, i) => checks[i]);
}
