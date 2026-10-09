// The five levels, hand-made from one-bar chunks.
//
// A chunk is one bar: 16 cells of a sixteenth note each, so beats fall on
// cells 0, 4, 8 and 12, and a jump on a beat peaks two cells later. Rows
// run top to bottom; the last row stands on the floor.
//   ^ spike   v hanging spike   # block   I pillar   o jump pad
//   O jump ring   _ gap in the floor (last row only)   . empty

export const BAR = 16;

export const CHUNKS = {
  run: ['................'],

  // Spikes and blocks to hop over, each cleared by a jump on the beat before.
  s1: ['..........^.....'],
  s1a: ['..^.............'],
  s2: ['..^.......^.....'],
  s3: ['..^...^.......^.'],
  s4: ['..^...^...^...^.'],
  b2: ['..#.......#.....'],
  b4: ['..#...^...#...^.'],
  d1: ['..........^^....'],
  d2: ['..^^......^^....'],
  d4: ['..^^..^...^^..^.'],
  bb: ['..#...#...#...#.'],
  sb: ['..^...#...^...#.'],
  dd: ['..^^..^^..^^..^^'],
  // A spike on a block: a tall hurdle, cleared from the beat before.
  bS: [
    '..^.......^.....',
    '..#.......#.....',
  ],

  // Gaps: three cells, jumped from the beat.
  gap: ['.___............'],
  gap2: ['.___.....___....'],
  gapS: ['.___......^.....'],
  gapD: ['.___......^^....'],

  // Platforms of blocks, sometimes with a spike on top.
  plat: ['..########......'],
  platS: [
    '......^.........',
    '..##########....',
  ],
  platS2: [
    '......^.....^...',
    '..############..',
  ],
  stairs: [
    '..........######',
    '......##########',
    '..##############',
  ],
  // Climbed with jumps on the beat, or by holding A.
  hops: [
    '..........###...',
    '......###.###...',
    '..###.###.###...',
  ],
  wall2: [
    '...######.......',
    '...######.......',
  ],
  wall2S: [
    '.........^......',
    '...#########....',
    '...#########....',
  ],

  // Islands: blocks over a pit, jump from one to the next.
  islands: ['..###___###___##'],
  land: ['##___...........'],

  // Jump pads launch the cube onto tall pillars.
  padUp: [
    '.....IIII.......',
    '.....IIII.......',
    '.o...IIII.......',
  ],
  tower: [
    '....III.........',
    '....III.........',
    '....III.........',
    'o...III.........',
  ],
  padS: [
    '.....IIII..^....',
    '.....IIII.......',
    '.o...IIII.......',
  ],
  // Pads in a row, each landing on the next: let go of A and fly.
  bounce: ['.o..^^.o..^^....'],

  // Rings: press A in the air over one to jump again.
  ring: [
    '..O.............',
    '................',
    '.______.........',
  ],
  ringChain: [
    '..O...O...O...O.',
    '................',
    '._______________',
  ],
  land3: ['___.............'],
  ringS: [
    '..O.......O.....',
    '................',
    '.______..______.',
  ],
  // A pad throws the cube up to a ring at the top of its arc; without the
  // press there it comes down in the spikes.
  padRing: [
    '...O............',
    '................',
    '................',
    '................',
    '.o.^^^^^........',
  ],

  // Ceilings: hanging spikes high up are only scenery, a low roof full of
  // spikes means: let go of A and stay on the floor.
  ceilS: [
    '..##########....',
    '..vvvvvvvvvv....',
    '................',
    '................',
    '......^...^.....',
  ],
  tunnel: [
    '..^^^^^^^^^^^^..',
    '..############..',
    '................',
  ],
};

// Neon colours per level: background, blocks and floor, spikes, scenery.
// music.key is the song's key (a MIDI root), so the effects play in it.
export const LEVELS = [
  {
    id: 'neon-steps',
    name: 'Neon Steps',
    difficulty: 'Easy',
    bpm: 120,
    palette: { bg: 0x060a26, main: 0x2de2ff, spike: 0xff4fd8, deco: 0x6a4dff },
    music: {
      key: 57,
      // A minor: Am, F, C, G. MIDI notes, one chord per bar.
      chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
      // Arpeggio over the chord, one entry per sixteenth: index into the
      // chord (3 and up are the next octave), -1 rests.
      arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3],
      arpLevel: 0.11,
    },
    sections: [
      { drums: 'kick', pad: true, bars: 'run run s1 s2' },
      { drums: 'beat', bass: 'off', riser: true, bars: 's2 b2 plat s2 gap s1 platS s4' },
      { drums: 'full', bass: 'off', arp: true, crash: true, bars: 's4 stairs run padUp s2 ring b4 platS' },
      { drums: 'kick', pad: true, arp: true, riser: true, bars: 'run s1 ring s2' },
      { drums: 'full', bass: 'roll', arp: true, crash: true, bars: 's4 platS2 gap2 stairs run padUp ring s4' },
      { drums: 'beat', pad: true, bars: 's2 run run run' },
    ],
  },
  {
    id: 'sunset-grid',
    name: 'Sunset Grid',
    difficulty: 'Normal',
    bpm: 128,
    palette: { bg: 0x1d0718, main: 0xff5fa8, spike: 0xffd23a, deco: 0xff9a3d },
    music: {
      key: 57, // C major, the relative of A minor
      // F, G, Em, Am: a bright, hopeful turn.
      chords: [[53, 57, 60], [55, 59, 62], [52, 55, 59], [57, 60, 64]],
      arp: [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 2, 4, 3, 2, 1],
      arpLevel: 0.07,
      wave: 'triangle',
      // The hook, one bar per chord: a note starts, 0 holds it, -1 rests.
      melody: [
        [72, 0, 0, 77, 0, 0, 76, 0, 72, 0, 0, 0, 69, 0, 72, 0],
        [74, 0, 0, 79, 0, 0, 77, 0, 74, 0, 0, 0, 71, 0, 74, 0],
        [76, 0, 0, 79, 0, 0, 83, 0, 81, 0, 79, 0, 76, 0, 74, 0],
        [76, 0, 0, 0, 0, 0, 0, -1, 72, 0, 74, 0, 76, 0, 79, 0],
      ],
      leadLevel: 0.1,
    },
    sections: [
      { drums: 'kick', pad: true, bars: 'run run s1 b2' },
      { drums: 'beat', bass: 'off', riser: true, bars: 's2 bb gap d1 plat bounce s2 platS' },
      { drums: 'full', bass: 'pulse', arp: true, lead: true, crash: true, bars: 's4 hops run padUp gapS ring islands land' },
      { drums: 'kick', pad: true, arp: true, riser: true, bars: 'run ring s2 bounce' },
      {
        drums: 'full',
        bass: 'pulse',
        arp: true,
        lead: true,
        crash: true,
        bars: 'bb wall2 d1 padUp ringS sb bounce b4 platS2 bS d1 s4',
      },
      { drums: 'beat', pad: true, bars: 's2 run run run' },
    ],
  },
  {
    id: 'night-circuit',
    name: 'Night Circuit',
    difficulty: 'Hard',
    bpm: 135,
    palette: { bg: 0x14051f, main: 0xc45cff, spike: 0x3dfcff, deco: 0xff3f9e },
    music: {
      key: 62,
      // D minor: Dm, Bb, F, C.
      chords: [[62, 65, 69], [58, 62, 65], [53, 57, 60], [60, 64, 67]],
      arp: [0, 3, 1, 3, 2, 3, 1, 3, 0, 3, 1, 3, 2, 4, 1, 3],
      arpLevel: 0.1,
    },
    sections: [
      { drums: 'kick', pad: true, bars: 'run s2 s4 d1' },
      { drums: 'beat', bass: 'off', riser: true, bars: 'd2 wall2 platS gap2 b4 islands land ceilS' },
      { drums: 'full', bass: 'off', arp: true, crash: true, bars: 's4 tower run ring d2 hops run padUp' },
      { drums: 'kick', arp: true, pad: true, riser: true, bars: 'ringChain land3 s2 tunnel' },
      {
        drums: 'full',
        bass: 'roll',
        arp: true,
        crash: true,
        bars: 'd2 islands land platS2 wall2 ringChain land3 tower run d2 b4 s4',
      },
      { drums: 'beat', pad: true, bars: 's2 run run run' },
    ],
  },
  {
    id: 'overvolt',
    name: 'Overvolt',
    difficulty: 'Harder',
    bpm: 150,
    palette: { bg: 0x1c0507, main: 0xff6a2b, spike: 0xffe14a, deco: 0xff2b55 },
    music: {
      key: 64,
      // E minor: Em, C, G, D.
      chords: [[64, 67, 71], [60, 64, 67], [55, 59, 62], [62, 66, 69]],
      arp: [0, 1, 2, 0, 1, 2, 3, 2, 1, 2, 3, 4, 3, 2, 1, 2],
      arpLevel: 0.1,
    },
    sections: [
      { drums: 'kick', pad: true, bars: 'run s4 d2 d1' },
      { drums: 'beat', bass: 'off', riser: true, bars: 'd2 wall2S tunnel islands land ceilS ringS hops' },
      {
        drums: 'full',
        bass: 'off',
        arp: true,
        crash: true,
        bars: 'd4 tower ringChain land3 islands land stairs run wall2 gapD padS b4',
      },
      { drums: 'kick', arp: true, pad: true, riser: true, bars: 'ringChain land3 tunnel s4' },
      {
        drums: 'full',
        bass: 'roll',
        arp: true,
        crash: true,
        bars: 'd4 hops gapS ringS tower run d2 tunnel islands land wall2S ringChain land3 padS platS2 d4',
      },
      { drums: 'beat', pad: true, bars: 's2 run run run' },
    ],
  },
  {
    id: 'hyperline',
    name: 'Hyperline',
    difficulty: 'Insane',
    bpm: 160,
    palette: { bg: 0x02081c, main: 0x4d8bff, spike: 0xff3b6b, deco: 0x8be9ff },
    music: {
      key: 54,
      // F# minor: F#m, D, A, E.
      chords: [[54, 57, 61], [50, 54, 57], [57, 61, 64], [52, 56, 59]],
      arp: [0, 1, 2, 4, 2, 1, 0, 2, 3, 1, 2, 4, 5, 4, 2, 1],
      arpLevel: 0.08,
      melody: [
        [78, 0, 81, 0, 85, 0, 83, 0, 81, 0, 78, 0, 76, 0, 78, 0],
        [78, 0, 81, 0, 86, 0, 85, 0, 81, 0, 78, 0, 74, 0, 76, 0],
        [76, 0, 81, 0, 85, 0, 88, 0, 85, 0, 81, 0, 76, 0, 81, 0],
        [80, 0, 0, 0, 83, 0, 0, 0, 80, 0, 76, 0, 73, 0, 76, 0],
      ],
      leadLevel: 0.09,
    },
    sections: [
      { drums: 'kick', pad: true, bars: 'run d2 dd d4' },
      { drums: 'beat', bass: 'off', riser: true, bars: 'd2 wall2S tunnel islands land ceilS padRing d1' },
      {
        drums: 'full',
        bass: 'gallop',
        arp: true,
        lead: true,
        crash: true,
        bars: 'dd tower ringChain land3 d2 padS gapD d4 islands land ringChain land3',
      },
      { drums: 'kick', arp: true, pad: true, riser: true, bars: 'padRing d1 tunnel d4' },
      {
        drums: 'full',
        bass: 'roll',
        arp: true,
        lead: true,
        crash: true,
        bars: 'd4 bS padS ringS d2 tunnel islands land wall2S ringChain land3 bounce tower d1 dd d4',
      },
      { drums: 'beat', pad: true, bars: 's2 run run run' },
    ],
  },
];
