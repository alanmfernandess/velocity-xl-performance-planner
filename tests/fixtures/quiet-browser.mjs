// Illustrative, isolated browser inputs. Never imported by production.
import { PRESSURE_LEVELS } from '../../js/weather/open-meteo.js';
export const fixture = {
  fetch: { status: 'Success' },
  general: { initial_altitude: '18000', route_distance: '246', route: 'DCT WPT1 WPT2 DCT' },
  times: { sched_out: '2026-10-21T12:00:00Z', sched_on: '2026-10-21T14:00:00Z' },
  origin: { icao_code: 'SBSP', pos_lat: -23.6261, pos_long: -46.6566, elevation: '2631' },
  destination: { icao_code: 'SBGL', pos_lat: -22.8099, pos_long: -43.2506, elevation: '28' },
  alternate: { icao_code: 'SBRJ', pos_lat: -22.9105, pos_long: -43.1631 },
  navlog: Array.from({ length: 18 }, (_, index) => ({
    ident: index === 0 ? 'SBSP' : index === 17 ? 'SBGL' : `WPT${index}`,
    pos_lat: -23.6261 + index * .048,
    pos_long: -46.6566 + index * .200,
    cum_distance: index * (246 / 17),
    mora: '6500',
    altitude_feet: '18000',
    wind_data: [
      { altitude: '10000', wind_dir: '235', wind_spd: '15', oat: '-5' },
      { altitude: '18000', wind_dir: '245', wind_spd: '22', oat: '-20' },
      { altitude: '25000', wind_dir: '255', wind_spd: '31', oat: '-34' },
    ],
  })),
};
export function gfsFixture(url) {
  const params = new URL(url).searchParams;
  const latitudes = params.get('latitude').split(',').map(Number);
  const longitudes = params.get('longitude').split(',').map(Number);
  const times = Array.from({ length: 48 }, (_, index) => `2026-10-${index < 24 ? '21' : '22'}T${String(index % 24).padStart(2, '0')}:00`);
  const hourlyUnits = { time: 'iso8601', cape: 'J/kg', freezing_level_height: 'm', precipitation: 'mm', cloud_cover: '%' };
  const hourly = { time: times, cape: times.map(() => 0), freezing_level_height: times.map(() => 3000),
    precipitation: times.map(() => 0), cloud_cover: times.map(() => 0) };
  for (const level of PRESSURE_LEVELS) {
    const metres = 44330 * (1 - (level / 1013.25) ** .1903);
    const fields = { temperature: [15 - .0065 * metres, '°C'], relative_humidity: [25, '%'], cloud_cover: [0, '%'],
      wind_speed: [20, 'kn'], wind_direction: [240, '°'], vertical_velocity: [0, 'm/s'], geopotential_height: [metres, 'm'] };
    for (const [field, [value, unit]] of Object.entries(fields)) {
      const name = `${field}_${level}hPa`;
      hourlyUnits[name] = unit;
      hourly[name] = times.map(() => value);
    }
  }
  return latitudes.map((latitude, index) => ({ latitude, longitude: longitudes[index], hourly_units: hourlyUnits, hourly }));
}
