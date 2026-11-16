/*
 * apps/winamp/tracks.js — the playlist, as data. Each track is a chord
 * progression (8 sixteenth-note steps per chord) plus an arpeggio and a drum
 * pattern; notesAt() turns (track, step) into the notes to play. No audio
 * code here, so tracks are easy to add and to test.
 *
 *   bpm         tempo
 *   leadWave    oscillator type for the melody; bassWave for the bass
 *   leadShift   semitones added to the melody (default 12 = one octave up)
 *   progression [{ bass: midi, notes: [midi, midi, midi] }, ...]
 *   arp         per step: index into chord notes (0-2), 3 = root an octave up, null = rest
 *   drums       per step: 'k' kick, 'h' hat, anything else = silence
 */

export const TRACKS = [
  {
    name: 'Pixel Sunrise', bpm: 128, leadWave: 'square', bassWave: 'triangle',
    arp: [0, 1, 2, 3, 2, 1, 2, 1], drums: 'k.h.k.h.',
    progression: [
      { bass: 36, notes: [60, 64, 67] },   // C
      { bass: 43, notes: [59, 62, 67] },   // G
      { bass: 45, notes: [57, 60, 64] },   // Am
      { bass: 41, notes: [57, 60, 65] },   // F
    ],
  },
  {
    name: 'Bug Hunt', bpm: 150, leadWave: 'square', bassWave: 'square',
    arp: [0, 0, 2, 0, 1, 0, 3, 2], drums: 'kh.hk.hh',
    progression: [
      { bass: 45, notes: [57, 60, 64] },   // Am
      { bass: 41, notes: [57, 60, 65] },   // F
      { bass: 36, notes: [60, 64, 67] },   // C
      { bass: 43, notes: [59, 62, 67] },   // G
    ],
  },
  {
    name: 'Lo-Fi Commit', bpm: 84, leadWave: 'triangle', bassWave: 'triangle', leadShift: 0,
    arp: [0, null, 1, null, 2, null, 3, null], drums: 'k...h...',
    progression: [
      { bass: 41, notes: [65, 69, 72] },   // Fmaj7
      { bass: 40, notes: [64, 67, 71] },   // Em7
      { bass: 38, notes: [62, 65, 69] },   // Dm7
      { bass: 36, notes: [64, 67, 71] },   // Cmaj7
    ],
  },
];

const DRUMS = { k: 'kick', h: 'hat' };
const STEPS_PER_CHORD = 8;

/** The lead note, bass note and drum hit (each possibly null) for a given step. */
export function notesAt(track, step) {
  const chord = track.progression[Math.floor(step / STEPS_PER_CHORD) % track.progression.length];
  const within = step % STEPS_PER_CHORD;
  const arp = track.arp[within];
  const shift = track.leadShift === undefined ? 12 : track.leadShift;
  const lead = arp === null ? null : (arp < 3 ? chord.notes[arp] : chord.notes[0] + 12) + shift;
  const bass = within === 0 || within === 4 ? chord.bass : null;
  return { lead, bass, drum: DRUMS[track.drums[within]] || null };
}
