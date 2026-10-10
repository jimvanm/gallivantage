// Builds the Tree Stand (lab/stand/index.html): the experimental farm. Run from anywhere:
//   node lab/stand/make.mjs
// It inlines the library's tree shapes and their statuses into template.html, so the page works
// on its own (open it, serve it, or publish it). Only shapes not yet approved get a row.
// Trial rows not yet in the library come from lab/stand/plots/*.json, each:
//   {key, name, like, stages:[...], status, models:{"<key>-1":model, ..., "<key>-far":model}}
// A plot may add vineyard:{layout:"metre"|"posts"|"bays"} to be planted in the Vineyard scene
// (see lab/vine/vines.mjs, which writes those plots).
// (models in the library's format: {tris,pos,col,idx}). Delete a plot file to retire its row.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.join(here,'..','..');
const models=JSON.parse(fs.readFileSync(path.join(root,'library/trees/models.json')));
const idx=JSON.parse(fs.readFileSync(path.join(root,'library/index.json')));
const status={};for(const s of idx.sets)if(s.id==='trees')for(const e of s.models)status[e.id]={status:e.status,notes:e.notes};
const extra=[],pd=path.join(here,'plots');
for(const f of (fs.existsSync(pd)?fs.readdirSync(pd):[]).filter(f=>f.endsWith('.json')).sort()){
  const p=JSON.parse(fs.readFileSync(path.join(pd,f)));extra.push({key:p.key,name:p.name,like:p.like,stages:p.stages,vineyard:p.vineyard});
  for(const[id,m]of Object.entries(p.models)){models[id]=m;status[id]={status:p.status,notes:'trial'}}}
const t=fs.readFileSync(path.join(here,'template.html'),'utf8').replace('/*LIBRARY_TREES*/null',JSON.stringify({models,status,extra}));
fs.writeFileSync(path.join(here,'index.html'),t);
console.log(`Tree Stand: ${Object.keys(models).length} shapes, ${extra.length} trial rows → lab/stand/index.html`);
