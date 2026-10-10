// Run: node lab/leaf/palms.mjs  (add --plots to put the trial rows back in the Tree Stand)
// Sample fan palms with the new leaf: n fingers (10 or 11), thick at the stalk end so the inner fan reads solid,
// outer fingers 20% shorter, and a slight curve: each finger is turned a little out of the leaf's flat plane,
// a bit more for each step out from the middle, so the leaf cups gently. Curve costs nothing: same triangles.
import { Mesh, reseed, jr, norm, cross, mixc, ring, band, stem, fan, FAN_L, FAN_D, FAN_BARK, SKIRT } from '../../library/shapes.mjs';
import fs from 'fs';
import path from 'path';
import { writeView, pack, here, root } from './view.mjs';
const add=(a,b,k=1)=>[a[0]+b[0]*k,a[1]+b[1]*k,a[2]+b[2]*k];
const turn=(u,v,t)=>add(u.map(x=>x*Math.cos(t)),v,Math.sin(t));       // u turned toward v by angle t
export function leaf(m,base,a,el,stalk,R,c0,c1,n,curl){
  const d=[Math.cos(a)*Math.cos(el),Math.sin(el),Math.sin(a)*Math.cos(el)];let s=norm(cross(d,[0,1,0])),nn=norm(cross(s,d));
  const r=1.25*2*jr();s=turn(s,nn,r);nn=norm(cross(s,d));               // turned about its stalk, as the library's flat leaves are
  const w=.05,hub=add(base,d,stalk);
  const b0=m.v(...add(base,s,w),c0),b1=m.v(...add(base,s,-w),c0),h0=m.v(...add(hub,s,w*.6),c0),h1=m.v(...add(hub,s,-w*.6),c0);
  m.idx.push(b0,b1,h1,b0,h1,h0);                                         // the stalk
  const th=Math.PI/(n-1),hw=R*.3*th/.7/2;                                // finger half-width at the stalk end
  for(let i=0;i<n;i++){const ang=-Math.PI/2+i*th,k=Math.abs(ang)/th;     // k: steps out from the middle
    let dd=turn(d,s,ang),ss=turn(s,d,-ang);dd=turn(dd,nn,curl*k);        // the curve: each step out tilts curl further
    const rr=R*(1-.2*Math.abs(ang)/(Math.PI/2));
    m.idx.push(m.v(...add(hub,ss,hw),c1),m.v(...add(hub,ss,-hw),c1),m.v(...add(hub,dd,rr),c1))}
}
function crown(m,top,cnt,stalk,R,low,n,curl){
  const high=low>.5?1.45:1.2;
  for(let k=0;k<cnt;k++){const t=cnt>1?k/(cnt-1):0;
    leaf(m,top,k*2.399+.2*jr(),high-(high-low)*t,stalk*(1+.1*jr()),R*(1+.08*jr()),mixc(FAN_L,FAN_D,.5+.3*t),mixc(FAN_L,[96,132,60],t),n,curl)}
}
function palm(m,T,skirt,cnt,n,curl){   // trunk and skirt exactly as the library's fan palm
  if(T>0){stem(m,[[0,0,0],[0,.6,0],[0,T*.5,0],[0,T,0]],[.46,.33,.27,.22],6,FAN_BARK);
    if(skirt>0){const A=ring(m,0,T+.15,0,.8,8,0,[150,122,82],.1),B=ring(m,0,T-skirt*.55,0,.62,8,.2,SKIRT,.12),C=ring(m,0,T-skirt,0,.42,8,.4,[96,74,48],.1);
      C.forEach((id,k)=>{m.pos[id*3+1]+=(k%2?.35:-.15)});band(m,A,B);band(m,B,C)}}
  crown(m,[0,Math.max(T,.25)+.3,0],cnt,T>0?1.1:1.6,1.15,T>0?-.75:.8,n,curl);
  for(let i=1;i<m.pos.length;i+=3)m.pos[i]=Math.max(m.pos[i],.03);
}
const CURL=2*Math.PI/180;
const STAGES=[["young",0,0,12],["4 m",4,3.4,20],["18 m",18,4,22]];
const J={},ORDER=[];let x=-15;
for(const[sn,T,sk,cnt]of STAGES)for(const n of[11,10]){
  reseed(11);const m=new Mesh();palm(m,T,sk,cnt,n,CURL);const k=`p${n}_${T}`;
  J[k]={tris:m.idx.length/3,pos:m.pos.map(v=>Math.round(v*1000)/1000+0),col:m.col,idx:m.idx};
  ORDER.push([k,`${n} · ${sn} · ${J[k].tris}`,x,0]);x+=6}
writeView('palms',{title:'Fan Palm Samples',lede:'Fan palms with the ten- and eleven-finger leaf, as tried before the ten was approved.',models:J,order:ORDER,
  cam:{tx:0,ty:8,tz:0,yaw:0,pitch:.1,dist:44},
  notes:`<section><h2>Sample palms</h2><ul class="how"><li>Young, 4 m and 18 m, each with 11 then 10 fingers. Labels: fingers · size · triangles.</li>
  <li>Trunk, skirt and leaf count as in the library. The ten-finger leaf is now the library's.</li></ul></section>`});
console.log(ORDER.map(o=>o[1]).join('\n'));
// The far palm: the library's far trunk and skirt, but the foliage is now a few flat oblongs (one hexagon each,
// 4 triangles), held out the way the detailed leaves are: spread round the top, from raised to drooping,
// each turned about its stalk. A fan's whole outline in one cheap shape.
function farPalm(m,cnt=7){
  stem(m,[[0,0,0],[0,.8,0]],[.03,.02],3,FAN_BARK);
  const A=ring(m,0,.86,0,.12,5,0,SKIRT),B=ring(m,0,.68,0,.06,5,.4,SKIRT);band(m,A,B);
  const top=[0,.86,0];
  for(let k=0;k<cnt;k++){const t=k/(cnt-1),a=k*2.399+.2*jr(),el=1.2-1.95*t;
    const d=[Math.cos(a)*Math.cos(el),Math.sin(el),Math.sin(a)*Math.cos(el)];let s=norm(cross(d,[0,1,0])),nn=norm(cross(s,d));
    s=turn(s,nn,1.25*2*jr());
    const c=add(top,d,.3),L=.24,W=.17,col=mixc(FAN_L,FAN_D,.3+.4*t);
    const ids=[0,1,2,3,4,5].map(i=>{const q=i*Math.PI/3;return m.v(...add(add(c,d,L*Math.cos(q)),s,W*Math.sin(q)),col)});
    fan(m,ids)}
  for(let i=1;i<m.pos.length;i+=3)m.pos[i]=Math.max(m.pos[i],.03);
}
// Far palm, third try: the plain 4-slice fan leaf (4 triangles), set at the end of an invisible stalk,
// so it sits and faces just as a detailed leaf does; only the stalk is not drawn. Leaves are kept small
// enough that none touches another, the skirt or the trunk (checked below, with a 15% margin).
function farPalm2(m,T=18,cnt=7,R=.5){
  stem(m,[[0,0,0],[0,T,0]],[.4,.22],3,FAN_BARK);
  const A=ring(m,0,T+.15,0,.8,5,0,SKIRT),B=ring(m,0,T-4,0,.42,5,.4,SKIRT);band(m,A,B);
  const top=[0,T+.3,0],curl=2*Math.PI/180,leaves=[];
  for(let k=0;k<cnt;k++){const t=k/(cnt-1),a=k*2.399+.2*jr(),el=1.2-1.95*t;
    const d=[Math.cos(a)*Math.cos(el),Math.sin(el),Math.sin(a)*Math.cos(el)];let s=norm(cross(d,[0,1,0])),nn=norm(cross(s,d));
    s=turn(s,nn,1.25*2*jr());nn=norm(cross(s,d));
    const hub=add(top,d,1.1),col=mixc(FAN_L,[96,132,60],t),c=m.v(...hub,col),rim=[],first=m.idx.length;
    for(let i=0;i<=4;i++){const ang=-Math.PI/2+i*Math.PI/4;let dd=turn(d,s,ang);dd=turn(dd,nn,curl*Math.abs(ang)/(Math.PI/9));rim.push(m.v(...add(hub,dd,R*(1-.2*Math.abs(ang)/(Math.PI/2))),col))}
    for(let i=0;i<4;i++)m.idx.push(c,rim[i],rim[i+1]);leaves.push([first,m.idx.length])}
  return leaves;
}
// Does any triangle of one group cross a triangle of another? (edge-through-triangle test, both ways)
function tri(m,o){return[0,1,2].map(k=>m.pos.slice(m.idx[o+k]*3,m.idx[o+k]*3+3))}
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function segHits(p,q,[a,b,c]){const e1=sub(b,a),e2=sub(c,a),dir=sub(q,p),h=cross(dir,e2),det=dot(e1,h);if(Math.abs(det)<1e-12)return false;
  const f=1/det,sv=sub(p,a),u=f*dot(sv,h);if(u<0||u>1)return false;const qv=cross(sv,e1),v=f*dot(dir,qv);if(v<0||u+v>1)return false;const t=f*dot(e2,qv);return t>=0&&t<=1}
function trisHit(A,B){for(const[X,Y]of[[A,B],[B,A]])for(let i=0;i<3;i++)if(segHits(X[i],X[(i+1)%3],Y))return true;return false}
export function farClear(R){reseed(11);const m=new Mesh();const L=farPalm2(m,18,7,R*1.15);const body=[0,L[0][0]];
  const groups=[body,...L].map(([a,b])=>{const g=[];for(let o=a;o<b;o+=3)g.push(tri(m,o));return g});
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++)for(const A of groups[i])for(const B of groups[j])if(trisHit(A,B))return false;return true}
const FR=.7;console.log('far leaf radius',FR,'clear with margin:',farClear(FR));
reseed(11);const FAR=new Mesh();farPalm2(FAR,18,7,FR);for(let i=1;i<FAR.pos.length;i+=3)FAR.pos[i]=Math.max(FAR.pos[i],.03);
const farJ={tris:FAR.idx.length/3,pos:FAR.pos.map(v=>Math.round(v*1000)/1000+0),col:FAR.col,idx:FAR.idx};console.log('far',farJ.tris);
// Trial plots for the Tree Stand: one row per finger count, its three stages, and the far try.
// Only written with --plots (they were retired once the ten-finger leaf was approved).
const lib=JSON.parse(fs.readFileSync(path.join(root,'library/trees/models.json')));
if(process.argv.includes('--plots'))for(const n of[11,10]){const models={};STAGES.forEach(([,T],i)=>models[`fan${n}-${i+1}`]=J[`p${n}_${T}`]);models[`fan${n}-far`]=farJ;
  fs.writeFileSync(path.join(here,'..','stand','plots',`fan${n}.json`),JSON.stringify({key:`fan${n}`,name:`Fan palm, ${n} fingers`,like:'Washingtonia (trial)',stages:['young','trunked','mature'],status:'testing',models}))}
