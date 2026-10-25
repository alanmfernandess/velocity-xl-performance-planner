// OFFLINE TEST DATA ONLY. Never imported by production code.
import { profileFixture } from './mission-profile.mjs';
import { ENSEMBLE_LEVELS } from '../../js/resilience/ensemble.js';
export function ensembleFixture(memberCount=5) {
  const f=profileFixture();
  const raw=f.gfsResponse.map(location=>{
    const hourly={time:location.hourly.time},hourly_units={time:'iso8601'};
    for(let member=0;member<memberCount;member++)for(const level of ENSEMBLE_LEVELS){
      const height=44330*(1-(level/1013.25)**.1903),suffix=member?`_member${String(member).padStart(2,'0')}`:'';
      for(const [field,value,unit] of [['temperature',15-height*.0065,'°C'],['geopotential_height',height,'m'],
        ['wind_speed',8+member*10,'kn'],['wind_direction',240,'°'],['relative_humidity',25,'%'],['cloud_cover',0,'%']]){
        const key=`${field}_${level}hPa${suffix}`;hourly[key]=hourly.time.map(()=>value);hourly_units[key]=unit;
      }
    }
    return {latitude:location.latitude,longitude:location.longitude,hourly,hourly_units};
  });
  return {...f,rawEnsemble:raw};
}
