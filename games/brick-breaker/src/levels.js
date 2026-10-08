// Hand-made brick maps: 11 columns, up to 8 rows, one character per cell.
//   .                 empty
//   r o y g t b p k   one-hit bricks (red, orange, yellow, green, teal, blue, purple, pink)
//   2 3               steel bricks that take 2 or 3 hits
//   x                 bomb bricks: one hit, and the blast hits every brick around
//   #                 gold bricks, unbreakable
// A level's tip shows under its name the first time a new kind of brick
// turns up. After the last map the levels loop with a faster ball.
// Every breakable brick must be reachable through cells that are not gold,
// and never only from the side: a brick with gold both above and below it is
// nearly impossible to hit.

export const LEVELS = [
  {
    name: 'Rainbow',
    map: [
      '...........',
      '.rrrrrrrrr.',
      '.ooooooooo.',
      '..yyyyyyy..',
      '...ggggg...',
    ],
  },
  {
    name: 'Pyramid',
    tip: 'Steel bricks take more than one hit',
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
    name: 'Hourglass',
    tip: 'Bombs blow up every brick around them',
    map: [
      'ttttttttttt',
      '.ttttttttt.',
      '..bbbbbbb..',
      '...bbxbb...',
      '....pxp....',
      '...pp2pp...',
      '..kkkkkkk..',
      '.kkkkkkkkk.',
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
    name: 'Smile',
    tip: 'Gold bricks never break',
    map: [
      '...ooooo...',
      '..oyyyyyo..',
      '.oy#yyy#yo.',
      '.oyyyyyyyo.',
      '.oy2yyy2yo.',
      '..oy222yo..',
      '...ooooo...',
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
    name: 'Chevron',
    map: [
      'k.........k',
      'pk.......kp',
      'bpk.....kpb',
      'tbpk...kpbt',
      'gtbpk.kpbtg',
      '.gtbpxpbtg.',
      '..gtb2btg..',
      '...g222g...',
    ],
  },
  {
    name: 'Gates',
    map: [
      'rrrrrrrrrrr',
      'ooxooooooxo',
      'yyyyyyyyyyy',
      '#2#2#2#2#2#',
      '...........',
      '.t.b.p.b.t.',
      '.t.b.p.b.t.',
    ],
  },
  {
    name: 'Fortress',
    map: [
      '22222222222',
      '2kkkkkkkkk2',
      '2pp#####pp2',
      '3bbbbbbbbb3',
      '...........',
      '#...y.y...#',
    ],
  },
  {
    name: 'Target',
    map: [
      '..rrrrrrr..',
      '.rooooooor.',
      'rooy222yoor',
      'roy23x32yor',
      'rooy222yoor',
      '.rooooooor.',
      '..rrrrrrr..',
    ],
  },
  {
    name: 'Crossfire',
    map: [
      '...........',
      '.#.ttttt.#.',
      '..#bbbbb#..',
      'r..p333p..r',
      '..#bbbbb#..',
      '.#.ttttt.#.',
      '...........',
    ],
  },
  {
    name: 'Vault',
    map: [
      '22#bxbxb#22',
      '2k#.....#k2',
      '2k###.###k2',
      '2kkkkkkkkk2',
      'pkkk3x3kkkp',
      'pkkkkkkkkkp',
      '.ppp...ppp.',
    ],
  },
  {
    name: 'Citadel',
    map: [
      '2#3#323#3#2',
      'x2x22322x2x',
      '.ppppppppp.',
      '2pbbx3xbbp2',
      '.ppppppppp.',
      '2#.2#3#2.#2',
      '.kxk...kxk.',
    ],
  },
];
