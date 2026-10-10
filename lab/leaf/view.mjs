// Writes a small model viewer page from lab/leaf/template.html: models side by side on flat ground,
// with the app's drag, pan and zoom. Used by the scripts in this folder.
//   writeView('name', {title, lede, models:{key:{tris,pos,col,idx}}, order:[[key,label,x,z],...], cam, notes:'<section>...</section>'})
// writes lab/leaf/name.html.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
export const here=path.dirname(fileURLToPath(import.meta.url)),root=path.join(here,'..','..');
export const pack=m=>({tris:m.idx.length/3,pos:m.pos.map(v=>Math.round(v*1000)/1000+0),col:m.col,idx:m.idx});
export function writeView(name,{title,lede='',models,order,cam={tx:0,ty:1,tz:0,yaw:0,pitch:.1,dist:4},notes=''}){
  const t=fs.readFileSync(path.join(here,'template.html'),'utf8').replaceAll('<!--TITLE-->',title).replace('<!--LEDE-->',lede)
    .replace('/*MODELS*/{}',JSON.stringify(models)).replace('/*ORDER*/[]',JSON.stringify(order))
    .replace(/\/\*CAM\*\/\{[^}]*\}/,JSON.stringify(cam)).replace('<!--NOTES-->',notes);
  fs.writeFileSync(path.join(here,`${name}.html`),t);console.log(`wrote lab/leaf/${name}.html`);
}
