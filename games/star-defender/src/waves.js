// The waves: a formation for each, the rows that wear armor, the new tricks
// they bring (divers, zigzag bombs) and how fast everything moves. After the
// eighth wave the table starts over with every trick on and keeps speeding up.

// Row 0 is the back row (stingers), row 4 the front (jellies). X is an alien.
const FULL = ['XXXXXXXXXX', 'XXXXXXXXXX', 'XXXXXXXXXX', 'XXXXXXXXXX', 'XXXXXXXXXX'];
const CHEVRON = ['XXXXXXXXXX', 'XXXXXXXXXX', '.XXXXXXXX.', '..XXXXXX..', '...XXXX...'];
const SPLIT = ['XXXX..XXXX', 'XXXX..XXXX', 'XXXX..XXXX', 'XXXX..XXXX', 'XXXX..XXXX'];
const DIAMOND = ['...XXXX...', '.XXXXXXXX.', 'XXXXXXXXXX', '.XXXXXXXX.', '...XXXX...'];
const WINGS = ['XXX....XXX', 'XXXX..XXXX', 'XXXXXXXXXX', '.XXXXXXXX.', '..XXXXXX..'];
const CHECKER = ['XXXXXXXXXX', 'X.X.X.X.X.', '.X.X.X.X.X', 'XXXXXXXXXX', 'X.XX.XX.XX'];
const ARROW = ['....XX....', '...XXXX...', '..XXXXXX..', '.XXXXXXXX.', 'XXXXXXXXXX'];

// note: the line under the wave's banner when it brings something new.
const WAVES = [
  { mask: FULL, armor: [], divers: 0, zigzag: false },
  { mask: CHEVRON, armor: [], divers: 0, zigzag: false },
  { mask: SPLIT, armor: [], divers: 1, zigzag: false, note: 'DIVERS INCOMING' },
  { mask: DIAMOND, armor: [0], divers: 1, zigzag: false, note: 'SILVER ARMOR TAKES 2 HITS' },
  { mask: ARROW, armor: [], divers: 1, zigzag: true, note: 'ZIGZAG BOMBS' },
  { mask: WINGS, armor: [0], divers: 2, zigzag: false },
  { mask: CHECKER, armor: [0, 1], divers: 2, zigzag: true },
  { mask: FULL, armor: [0, 1], divers: 2, zigzag: true, note: 'FULL ASSAULT' },
];

// Everything a wave needs, for wave number n (1, 2, ...).
export function waveInfo(n) {
  const w = WAVES[(n - 1) % WAVES.length];
  const loop = Math.floor((n - 1) / WAVES.length);
  const k = n - 1;
  return {
    layout: { mask: w.mask, armor: loop > 0 && w.armor.length === 0 ? [0] : w.armor },
    note: loop > 0 && (n - 1) % WAVES.length === 0 ? `LOOP ${loop + 1} · FASTER` : loop === 0 ? w.note : '',
    // March: a factor on the step interval (smaller is faster).
    speed: Math.max(0.5, 1 - 0.06 * k),
    // Bombs: the wait between two, how many may fall at once, how fast.
    bombWait: Math.max(0.45, 1 - 0.065 * k),
    maxBombs: Math.min(6, 2 + Math.floor(n / 2)),
    bombSpeed: Math.min(9.5, 6 + 0.35 * k),
    zigzag: w.zigzag || loop > 0,
    // Divers: how many at once (0: none), the wait between dives, their speed.
    divers: loop > 0 ? 2 : w.divers,
    diveWait: Math.max(2.2, 6 - 0.35 * k),
    diveSpeed: Math.min(9, 6 + 0.25 * k),
  };
}
