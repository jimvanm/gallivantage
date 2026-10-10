// Builds the Tree Stand (lab/stand/index.html): the experimental farm. Run from anywhere:
//   node lab/stand/make.mjs
// It inlines the library's tree shapes and their statuses into template.html, so the page works
// on its own (open it, serve it, or publish it). Only shapes not yet approved get a row.
// Trial rows not yet in the library come from lab/stand/plots/*.json, each:
//   {key, name, like, stages:[...], status, models:{"<key>-1":model, ..., "<key>-far":model}}
// (models in the library's format: {tris,pos,col,idx}). Delete a plot file to retire its row.
// rowOnly:true keeps a kind out of the styles scene: its shapes are only planted as parts of rows
// (the vine's pieces, added from the library below, are planted that way).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.join(here,'..','..');
const models=JSON.parse(fs.readFileSync(path.join(root,'library/trees/models.json')));
const idx=JSON.parse(fs.readFileSync(path.join(root,'library/index.json')));
const status={};for(const s of idx.sets)if(s.id==='trees')for(const e of s.models)status[e.id]={status:e.status,notes:e.notes};
const extra=[],pd=path.join(here,'plots');
// The vine's row pieces, from the library's farm set, as row-only kinds: vine10, vine3, vine1 (stage n is the
// piece starting on outline floor((n-1)/3) and ending on outline (n-1)%3), and vinecap (stage n: outline n-1).
const farm=JSON.parse(fs.readFileSync(path.join(root,'library/farm/models.json')));
const farmStatus={};for(const s of idx.sets)if(s.id==='farm')for(const e of s.models)farmStatus[e.id]=e.status;
const EMPTY={tris:0,pos:[],col:[],idx:[]};
for(const len of[10,3,1]){const key=`vine${len}`,stages=[];
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){const n=stages.length+1;models[`${key}-${n}`]=farm[`vine-${len}-${i}${j}`];status[`${key}-${n}`]={status:farmStatus[`vine-${len}-${i}${j}`],notes:''};stages.push(`${i} to ${j}`)}
  models[`${key}-far`]=farm[`vine-${len}-far`];status[`${key}-far`]={status:farmStatus[`vine-${len}-far`],notes:''};
  extra.push({key,name:`Vine, ${len} m piece`,like:'Row piece',stages,rowOnly:true})}
{const stages=[];for(let n=1;farm[`vine-cap-${n}`];n++){models[`vinecap-${n}`]=farm[`vine-cap-${n}`];status[`vinecap-${n}`]={status:farmStatus[`vine-cap-${n}`],notes:''};stages.push(`outline ${n-1}`)}
  models['vinecap-far']=EMPTY;status['vinecap-far']={status:'approved',notes:''};extra.push({key:'vinecap',name:'Vine row end',like:'Row end',stages,rowOnly:true})}
for(const f of (fs.existsSync(pd)?fs.readdirSync(pd):[]).filter(f=>f.endsWith('.json')).sort()){
  const p=JSON.parse(fs.readFileSync(path.join(pd,f)));extra.push({key:p.key,name:p.name,like:p.like,stages:p.stages,rowOnly:p.rowOnly});
  for(const[id,m]of Object.entries(p.models)){models[id]=m;status[id]={status:p.status,notes:'trial'}}}
const t=fs.readFileSync(path.join(here,'template.html'),'utf8').replace('/*LIBRARY_TREES*/null',JSON.stringify({models,status,extra}));
fs.writeFileSync(path.join(here,'index.html'),t);
console.log(`Tree Stand: ${Object.keys(models).length} shapes, ${extra.length} trial rows → lab/stand/index.html`);
