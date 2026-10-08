// The three levels, hand-made from one-bar chunks.
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
export const LEVELS = [
  {
    name: 'Neon Steps',
    difficulty: 'Easy',
    bpm: 120,
    palette: { bg: 0x060a26, main: 0x2de2ff, spike: 0xff4fd8, deco: 0x6a4dff },
    music: {
      // A minor: Am, F, C, G. MIDI notes, one chord per bar.
      chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
      // Arpeggio over the chord, one entry per sixteenth: index into the
      // chord (3 and up are the next octave), -1 rests.
      arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3],
      lead: 0.11,
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
    name: 'Night Circuit',
    difficulty: 'Medium',
    bpm: 135,
    palette: { bg: 0x14051f, main: 0xc45cff, spike: 0x3dfcff, deco: 0xff3f9e },
    music: {
      // D minor: Dm, Bb, F, C.
      chords: [[62, 65, 69], [58, 62, 65], [53, 57, 60], [60, 64, 67]],
      arp: [0, 3, 1, 3, 2, 3, 1, 3, 0, 3, 1, 3, 2, 4, 1, 3],
      lead: 0.1,
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
    name: 'Overvolt',
    difficulty: 'Hard',
    bpm: 150,
    palette: { bg: 0x1c0507, main: 0xff6a2b, spike: 0xffe14a, deco: 0xff2b55 },
    music: {
      // E minor: Em, C, G, D.
      chords: [[64, 67, 71], [60, 64, 67], [55, 59, 62], [62, 66, 69]],
      arp: [0, 1, 2, 0, 1, 2, 3, 2, 1, 2, 3, 4, 3, 2, 1, 2],
      lead: 0.1,
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
];
