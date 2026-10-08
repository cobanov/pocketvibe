// The race's continuous sounds: the player's engine (a fake gearbox makes it
// climb and drop), the rivals' engines fading with distance, tyre squeal,
// curb rumble and the rattle of driving on the grass. All are short loops
// from sound.js whose volume and pitch follow the cars every frame.

import { BOOST_SPEED, TOP_SPEED } from './shared.js';
import { SURFACE_CURB, SURFACE_GRASS } from './car.js';
import { skidding } from './race.js';

// Speed (world units/s) where each gear starts; the engine revs up through a
// gear and drops when the next one comes in.
const GEARS = [0, 10, 18, 26, 34, 43, 99];
const RIVAL_PITCH = [0.95, 1.0, 1.05];

export function createRaceAudio(sound) {
  const engine = sound.loop('engine');
  const rivals = RIVAL_PITCH.map(() => sound.loop('engine'));
  const screech = sound.loop('screech');
  const offroad = sound.loop('offroad');
  const rumble = sound.loop('rumble');
  let rpm = 0.15;
  let squeal = 0;
  let silent = true;

  function gearRpm(speed) {
    let g = 0;
    while (speed >= GEARS[g + 1]) g++;
    const frac = (speed - GEARS[g]) / (GEARS[g + 1] - GEARS[g]);
    return g === 0 ? 0.15 + 0.75 * frac : 0.42 + 0.55 * Math.min(1, frac);
  }

  return {
    // level: 1 racing, a little lower behind the results, 0 silent (title,
    // pause). rev: the player holds A on the grid.
    update(dt, cars, level, rev) {
      const player = cars[0];
      // Silent: the loops stop rather than play at zero volume.
      if (level <= 0) {
        if (!silent) {
          silent = true;
          engine.stop();
          for (let k = 0; k < rivals.length; k++) rivals[k].stop();
          screech.stop();
          offroad.stop();
          rumble.stop();
        }
        return;
      }
      silent = false;
      const speed = Math.abs(player.fwd);
      const gas = player.throttle > 0 || player.brake > 0 || rev ? 1 : 0;
      const target = speed < 1 ? (rev ? 0.95 : 0.12) : gearRpm(speed);
      rpm += (target - rpm) * Math.min(1, dt * (target < rpm ? 9 : 6));
      engine.set(level * (0.3 + 0.22 * gas + 0.1 * rpm), (0.6 + rpm * 1.15) * (gas ? 1 : 0.94));

      for (let k = 0; k < rivals.length; k++) {
        const car = cars[k + 1];
        const d = Math.hypot(car.x - player.x, car.z - player.z);
        const near = Math.max(0, 1 - d / 55);
        const v = Math.min(1, Math.abs(car.fwd) / BOOST_SPEED);
        rivals[k].set(level * 0.28 * near * near, (0.62 + v * 1.05) * RIVAL_PITCH[k]);
      }

      // Squeal fades in and out a little, so a short slide does not click.
      const slide = skidding(player) ? Math.min(1, 0.4 + (Math.abs(player.lat) - 5) / 8) : 0;
      squeal += (slide - squeal) * Math.min(1, dt * 12);
      screech.set(level * 0.32 * squeal, 0.96 + 0.08 * squeal);

      const k = Math.min(1, speed / TOP_SPEED);
      offroad.set(player.surface === SURFACE_GRASS && speed > 2 ? level * 0.42 * Math.min(1, speed / 18) : 0, 0.8 + 0.4 * k);
      rumble.set(player.surface === SURFACE_CURB && speed > 4 ? level * 0.38 * Math.min(1, speed / 25) : 0, 0.7 + 0.6 * k);
    },
  };
}
