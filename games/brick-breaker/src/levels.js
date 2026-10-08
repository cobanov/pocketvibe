// Hand-made brick maps: 11 columns, up to 8 rows, one character per cell.
//   .                 empty
//   r o y g t b p k   one-hit bricks (red, orange, yellow, green, teal, blue, purple, pink)
//   2 3               steel bricks that take 2 or 3 hits
//   #                 gold bricks, unbreakable
// After the last map the levels loop with a faster ball.

export const LEVELS = [
  {
    name: 'Rainbow',
    map: [
      '...........',
      '.rrrrrrrrr.',
      '.ooooooooo.',
      '.yyyyyyyyy.',
      '.ggggggggg.',
      '.ttttttttt.',
    ],
  },
  {
    name: 'Pyramid',
    map: [
      '.....2.....',
      '....kkk....',
      '...ppppp...',
      '..bbbbbbb..',
      '.ttttttttt.',
      'ggggggggggg',
      '2.2.2.2.2.2',
    ],
  },
  {
    name: 'Checkers',
    map: [
      'r.o.y.g.t.b',
      '.k.r.o.y.g.',
      'p.b.t.g.y.o',
      '.2.2.2.2.2.',
      'b.p.k.r.o.y',
      '.t.g.y.o.r.',
    ],
  },
  {
    name: 'Heart',
    map: [
      '.kkk...kkk.',
      'kkkkk.kkkkk',
      'kkkkkkkkkkk',
      '.rrrrrrrrr.',
      '..ooooooo..',
      '...yyyyy...',
      '....ggg....',
      '.....2.....',
    ],
  },
  {
    name: 'Invader',
    map: [
      '..g.....g..',
      '...g...g...',
      '..ggggggg..',
      '.gg#ggg#gg.',
      'ggggggggggg',
      'g.ggggggg.g',
      'g.g.....g.g',
      '...22.22...',
    ],
  },
  {
    name: 'Fortress',
    map: [
      '22222222222',
      '3kkkkkkkkk3',
      '3pp#####pp3',
      '3bbbbbbbbb3',
      '...........',
      '##..y.y..##',
    ],
  },
  {
    name: 'Crossfire',
    map: [
      '#.........#',
      '.#.ttttt.#.',
      '..#bbbbb#..',
      'r..p333p..r',
      '..#bbbbb#..',
      '.#.ttttt.#.',
      '#.........#',
    ],
  },
];
