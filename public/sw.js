const BASE=__BASE_PATH__;
const CACHE='speedreader-shell-__BUILD_HASH__';
const EXTRA=[];
const HOME=`${BASE}/`;
const CORE=[HOME,`${BASE}/manifest.webmanifest`,`${BASE}/icon-192.png`,`${BASE}/icon-512.png`,...EXTRA];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('speedreader-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(HOME,copy))}return response}).catch(()=>caches.match(HOME)));
  return;
 }
 event.respondWith(caches.match(event.request).then(found=>found||fetch(event.request).then(response=>{
  if(response.ok&&new URL(event.request.url).pathname.startsWith(`${BASE}/_next/static/`)){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
  return response;
 })));
});
