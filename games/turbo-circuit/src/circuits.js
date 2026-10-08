// The circuits: each one's layout (spline control points, driven in order),
// boost pads, laps, colors and scenery. The road, the AI's racing line, the
// scenery and the minimap are all built from these.

export const CIRCUITS = [
  {
    id: 'sunny',
    name: 'Sunny Park',
    tag: 'Flowing curves, one tight hairpin',
    laps: 3,
    points: [
      [10, -98], [62, -94], [106, -78], [124, -42], [118, -6], [104, 22],
      [122, 50], [140, 86], [124, 108], [100, 100], [70, 72], [26, 66],
      [-8, 92], [-48, 106], [-92, 98], [-128, 70], [-126, 26], [-104, -4],
      [-122, -40], [-118, -78], [-80, -96],
    ],
    // Position along the lap (0..1) and lateral offset.
    pads: [[0.045, 0], [0.17, 0], [0.585, 1.5]],
    seed: 7,
    skySeed: 3,
    fog: [60, 140], // where the haze starts and where it hides everything
    trees: { kinds: ['pine', 'round'], mix: 0.55, density: 1 },
    colors: {
      sky: 0xb4e0fb, // horizon haze: fog and the bottom of the sky
      skyTop: 0x3f8fe0,
      far: 0x8fb6d8, // the far ring of hills
      near: 0x86c2a4, // the near ring
      ground: 0x62b04a, // grass, sand or snow, under the mowing stripes
      verge: 0x5aa845,
      asphalt: [0x4d5260, 0x555a68],
      boards: [0xffffff, 0xe8433a, 0x2f6fdf, 0xffd23f],
      light: 0x5a7a4a, // the hemisphere light's ground color
      dust: [0x8a6a3e, 0x4f9a3c], // what the wheels throw up off the road
    },
  },
  {
    id: 'canyon',
    name: 'Canyon Run',
    tag: 'Flat out down a huge straight',
    laps: 3,
    points: [
      [-60, -80], [20, -82], [100, -80], [160, -78], [190, -70], [200, -52], [190, -36],
      [166, -32], [130, -22], [100, 0], [80, 30], [50, 50], [0, 56], [-60, 52], [-100, 40],
      [-130, 50], [-170, 70], [-205, 50], [-214, 10], [-204, -36], [-176, -66], [-130, -80],
    ],
    pads: [[0.08, 0], [0.52, 0], [0.8, 0]],
    seed: 11,
    fog: [70, 145],
    trees: { kinds: ['cactus', 'rock'], mix: 0.5, density: 0.5 },
    hills: { far: 34, mesa: true },
    colors: {
      sky: 0xf3dcb5,
      skyTop: 0x4b8fd6,
      far: 0xc4774a,
      near: 0xd9a46c,
      ground: 0xe2c287,
      verge: 0xd2ad6e,
      asphalt: [0x5a5658, 0x625e60],
      boards: [0xffffff, 0xff8a2a, 0x1fa3a3, 0xe8433a],
      light: 0x9a7a52,
      sun: 0xfff0d8,
      rock: 0xb8673e,
      dust: [0xd9b77a, 0xc49a5c],
    },
  },
  {
    id: 'maple',
    name: 'Maple Woods',
    tag: 'Twisty and technical',
    laps: 3,
    points: [
      [-10, -100], [30, -100], [70, -100], [96, -82], [86, -50], [64, -24], [60, 4], [80, 26],
      [110, 30], [134, 46], [136, 76], [116, 96], [84, 96], [60, 110], [40, 130], [10, 134],
      [-30, 124], [-70, 122], [-96, 100], [-100, 64], [-84, 40], [-56, 40], [-28, 36],
      [-16, 16], [-30, -4], [-60, -8], [-92, -20], [-106, -56], [-96, -88], [-70, -100],
      [-40, -100],
    ],
    pads: [[0.06, 0], [0.55, 0]],
    seed: 23,
    fog: [40, 102], // misty woods
    trees: { kinds: ['autumn', 'pine'], mix: 0.75, density: 0.9 },
    colors: {
      sky: 0xd7e6ee,
      skyTop: 0x5b9bd8,
      far: 0xa98c7a,
      near: 0x9c9a58,
      ground: 0x93a845,
      verge: 0x8aa040,
      asphalt: [0x4d5260, 0x555a68],
      boards: [0xffffff, 0xe8433a, 0x2e8a4e, 0xffd23f],
      light: 0x6a6a3a,
      sun: 0xfff2e0,
      autumn: [0xe0522c, 0xf08a28, 0xf4c033, 0xc8402a, 0xe8a030],
      dust: [0x8a6a3e, 0xc0782c],
    },
  },
  {
    id: 'frost',
    name: 'Frost Peak',
    tag: 'Fast sweepers, a deep hairpin',
    laps: 3,
    points: [
      [0, -120], [45, -120], [90, -117], [132, -96], [156, -56], [160, -10], [146, 40],
      [116, 76], [80, 98], [50, 100], [28, 82], [22, 40], [20, 6], [0, -16], [-22, -6],
      [-28, 32], [-32, 80], [-50, 108], [-90, 116], [-130, 96], [-150, 50], [-148, -10],
      [-130, -70], [-96, -110], [-45, -120],
    ],
    pads: [[0.06, 0], [0.4, 0], [0.75, 0]],
    seed: 31,
    fog: [55, 130],
    trees: { kinds: ['snowpine', 'rock'], mix: 0.8, density: 0.9 },
    hills: { far: 40 },
    colors: {
      sky: 0xe4e2f0,
      skyTop: 0x6f8fd0,
      far: 0xf6f8fc,
      near: 0xb9c6da,
      ground: 0xdfe6ef,
      verge: 0xcfd8e4,
      asphalt: [0x474b58, 0x4f5361],
      boards: [0xffffff, 0x2f6fdf, 0xe8433a, 0x8a4fff],
      light: 0x8a96b0,
      sun: 0xfff4f4,
      rock: 0x8a92a4,
      dust: [0xf4f7fb, 0xd0dae6],
    },
  },
];
