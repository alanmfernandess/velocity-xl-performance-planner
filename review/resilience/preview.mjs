// Review-only harness. Production never imports this file or these fixtures.
import { ensembleFixture } from '../../tests/fixtures/resilience.mjs';
const fixture=ensembleFixture(7),base=new URL('../../',location.href),frame=document.querySelector('#previewFrame');
function bootstrap(fixture){
  const memory=new Map([['velocityxl.oxygen',JSON.stringify({bottleModel:'SK-12-24',bottles:4,seats:[true,true,true,true,true]})]]);
  const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]??null,get length(){return memory.size;}};
  Object.defineProperty(window,'localStorage',{value:storage});Object.defineProperty(window,'sessionStorage',{value:storage});
  const original=window.fetch.bind(window),json=value=>Promise.resolve(new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));
  window.fetch=(resource,options)=>{
    const url=new URL(typeof resource==='string'?resource:resource.url,document.baseURI);
    if(url.pathname.endsWith('/xml.fetcher.php'))return json(fixture.raw);
    if(url.pathname.endsWith('/v1/gfs'))return json(fixture.gfsResponse);
    if(url.pathname.includes('weather-snapshots')&&url.pathname.endsWith('/latest.json'))return json({generatedAt:new Date().toISOString(),sigmets:[],pireps:[]});
    if(url.pathname.endsWith('/v1/ensemble')){
      const lat=url.searchParams.get('latitude').split(',').map(Number),lon=url.searchParams.get('longitude').split(',').map(Number);
      return json(lat.map((p,i)=>({...fixture.rawEnsemble[0],latitude:p,longitude:lon[i]})));
    }
    if(url.origin!==location.origin)return Promise.reject(new Error('DEMO_EXTERNAL_REQUEST_BLOCKED'));
    return original(resource,options);
  };
}
const html=await(await fetch(new URL('index.html',base))).text();
frame.onload=()=>{const doc=frame.contentDocument;if(!doc.querySelector('#quickPilotId'))return;doc.querySelector('#quickPilotId').value='ILLUSTRATIVE';doc.querySelector('#importLatest').click();};
frame.srcdoc=html.replace('<head>',`<head><base href="${base.href}"><script>(${bootstrap.toString()})(${JSON.stringify({raw:fixture.raw,gfsResponse:fixture.gfsResponse,rawEnsemble:fixture.rawEnsemble})})</script>`);
