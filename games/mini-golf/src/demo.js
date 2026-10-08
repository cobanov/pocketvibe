// Demo putts for the title screen, one list per hole, each shot as
// [tick, x, z, angle, power]: at that simulation tick the ball is at (x, z)
// and is putted at `angle` with `power`. Found offline by simulating shots,
// so the same physics replays them exactly.

export const DEMO = [
  [[360, 0, 4, 4.71239, 0.36]],
  [[360, 2.5, 4.5, 5.03527, 0.98]],
  [[360, 0, 5.5, 5.27089, 0.78]],
  [[360, 0, 5, 4.79966, 0.84]],
  [[360, 0, 6, 4.05789, 0.98]],
  [[360, -2, 4.5, 4.49422, 0.98], [1613, 2.99709, -4.91858, 1.55334, 0.08]],
  [[360, -3, 4.5, 5.77704, 0.98], [1596, -0.08093, -4.55887, 3.10669, 0.14]],
  [[360, 0, 5, 4.71239, 0.44]],
  [[360, -4, 6.5, 4.24115, 1], [1562, -1.45515, -5.82477, 5.1749, 0.94], [2964, 6.13924, 1.48737, 1.0821, 0.22]],
];
