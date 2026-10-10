// Shared building blocks for library shapes (trees and the like).
// Metres, y up, x east, z south, origin at the middle of the base.
// Shapes are corners with a colour each, and triangles; the app works out which
// way each face points from the screen, so there are no normals. Same format as
// the landmarks (tools/landmarks/mesh.mjs).
import { Mesh } from '../tools/landmarks/mesh.mjs';
export { Mesh };
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const norm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l]};
export { cross };
// Repeatable wobble: reseed() before each shape so a shape never changes unless its builder does.
let js=7;export const jr=()=>{js=(js*16807)%2147483647;return js/2147483647-.5};
export function reseed(n=11){js=n}
export const mixc=(a,b,t)=>a.map((x,i)=>Math.round(x+(b[i]-x)*t));
export function ring(m,cx,y,cz,r,n,rot,c,jit=0){const ids=[];for(let k=0;k<n;k++){const a=rot+k/n*Math.PI*2,rr=r*(1+jit*jr());ids.push(m.v(cx+Math.cos(a)*rr,y+jit*r*.4*jr(),cz+Math.sin(a)*rr,c))}return ids}
export function band(m,A,B){const n=A.length;for(let k=0;k<n;k++){const k2=(k+1)%n;m.idx.push(A[k],A[k2],B[k2],A[k],B[k2],B[k])}}
export function apex(m,A,t){for(let k=0;k<A.length;k++)m.idx.push(A[k],A[(k+1)%A.length],t)}
export function fan(m,A){for(let k=1;k<A.length-1;k++)m.idx.push(A[0],A[k],A[k+1])}
export function cone(m,y0,y1,r,n,cb,ct,rot=0,jit=0,cx=0,cz=0){const A=ring(m,cx,y0,cz,r,n,rot,cb,jit);apex(m,A,m.v(cx,y1,cz,ct));fan(m,A)}
export function stem(m,pts,radii,n,c){let prev=null;pts.forEach((p,i)=>{const R=ring(m,p[0],p[1],p[2],radii[i],n,0,c);if(prev)band(m,prev,R);prev=R})}
export function ico(m,cx,cy,cz,rx,ry,rz,ct,cb,jit=.1){
  const t=(1+Math.sqrt(5))/2,L=Math.hypot(1,t);
  const P=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
  const F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  const ids=P.map(q=>{const k=1+jit*jr(),y=q[1]/L;return m.v(cx+q[0]/L*rx*k,cy+y*ry*k,cz+q[2]/L*rz*k,mixc(cb,ct,(y+1)/2))});
  for(const f of F)m.idx.push(ids[f[0]],ids[f[1]],ids[f[2]]);
}
// A lopsided octahedron: an uneven lump for far shapes (8 triangles).
export function lump(m,cx,cy,cz,rx,ry,rz,ct,cb){
  const q=()=>1+.28*jr(),a=m.v(cx+rx*q(),cy+ry*.2*jr(),cz+rz*.25*jr(),mixc(cb,ct,.5)),b=m.v(cx+rx*.25*jr(),cy+ry*.2*jr(),cz+rz*q(),mixc(cb,ct,.45)),
    c=m.v(cx-rx*q(),cy+ry*.2*jr(),cz+rz*.25*jr(),mixc(cb,ct,.5)),d=m.v(cx+rx*.25*jr(),cy+ry*.2*jr(),cz-rz*q(),mixc(cb,ct,.55)),
    t=m.v(cx+rx*.3*jr(),cy+ry*q(),cz+rz*.3*jr(),ct),u=m.v(cx,cy-ry*(.8+.2*jr()),cz,cb);
  m.idx.push(a,b,t,b,c,t,c,d,t,d,a,t,b,a,u,c,b,u,d,c,u,a,d,u);
}
export function octa(m,cx,cy,cz,rx,ry,rz,ct,cb){
  const a=m.v(cx+rx,cy,cz,mixc(cb,ct,.5)),b=m.v(cx,cy,cz+rz,mixc(cb,ct,.45)),c=m.v(cx-rx,cy,cz,mixc(cb,ct,.5)),d=m.v(cx,cy,cz-rz,mixc(cb,ct,.55)),t=m.v(cx,cy+ry,cz,ct),u=m.v(cx,cy-ry,cz,cb);
  m.idx.push(a,b,t,b,c,t,c,d,t,d,a,t,b,a,u,c,b,u,d,c,u,a,d,u);
}
export function fronds(m,top,n,len,droop,w,c0,c1,rot,segs){
  for(let k=0;k<n;k++){const a=rot+k/n*Math.PI*2,dx=Math.cos(a),dz=Math.sin(a),px=-dz*w,pz=dx*w;
    const b=m.v(top[0],top[1],top[2],c0);
    if(segs===1){const tip=m.v(top[0]+dx*len,top[1]-droop,top[2]+dz*len,c1),l=m.v(top[0]+dx*len*.45+px,top[1]+.02,top[2]+dz*len*.45+pz,c1),r=m.v(top[0]+dx*len*.45-px,top[1]+.02,top[2]+dz*len*.45-pz,c1);m.idx.push(b,l,tip,b,tip,r);continue}
    const l=m.v(top[0]+dx*len*.4+px,top[1]+.05,top[2]+dz*len*.4+pz,mixc(c0,c1,.5)),r=m.v(top[0]+dx*len*.4-px,top[1]+.05,top[2]+dz*len*.4-pz,mixc(c0,c1,.5));
    const l2=m.v(top[0]+dx*len*.75+px*.7,top[1]-droop*.35,top[2]+dz*len*.75+pz*.7,c1),r2=m.v(top[0]+dx*len*.75-px*.7,top[1]-droop*.35,top[2]+dz*len*.75-pz*.7,c1);
    const tip=m.v(top[0]+dx*len,top[1]-droop,top[2]+dz*len,c1);
    m.idx.push(b,l,r,l,l2,r2,l,r2,r,l2,tip,r2);
  }
}
// A hexagonal pad: flat clump of foliage (12 triangles).
export function pad(m,cx,cy,cz,rx,ry,rz,ct,cb,rot=0,jit=.15){
  const R=[];for(let k=0;k<6;k++){const a=rot+k/6*Math.PI*2,q=1+jit*jr();R.push(m.v(cx+Math.cos(a)*rx*q,cy+ry*.25*jr(),cz+Math.sin(a)*rz*q,mixc(cb,ct,.55)))}
  const t=m.v(cx+rx*.1*jr(),cy+ry,cz+rz*.1*jr(),ct),b=m.v(cx,cy-ry*.6,cz,cb);
  for(let k=0;k<6;k++){const k2=(k+1)%6;m.idx.push(R[k],R[k2],t,R[k2],R[k],b)}
}
// Palm frond in metres: rises, arches, droops. 4 triangles.
export function frond(m,base,a,len,rise,droop,w,c0,c1){
  const dx=Math.cos(a),dz=Math.sin(a),px=-dz*w,pz=dx*w,P=(f,y)=>[base[0]+dx*len*f,base[1]+y,base[2]+dz*len*f];
  const b=m.v(...base,c0),m1=P(.4,rise),m2=P(.75,rise*.4-droop*.45),tp=P(1,-droop);
  const l=m.v(m1[0]+px,m1[1],m1[2]+pz,mixc(c0,c1,.5)),r=m.v(m1[0]-px,m1[1],m1[2]-pz,mixc(c0,c1,.5));
  const l2=m.v(m2[0]+px*.7,m2[1],m2[2]+pz*.7,c1),r2=m.v(m2[0]-px*.7,m2[1],m2[2]-pz*.7,c1),t=m.v(...tp,c1);
  m.idx.push(b,l,r,l,l2,r2,l,r2,r,l2,t,r2);
}
export const BARK=[84,62,44],PINEBARK=[128,82,54],PALMBARK=[140,118,88],BIRCH=[150,146,134];
export const SPRUCE_D=[30,62,40],SPRUCE_L=[62,108,64],NEEDLE_D=[44,78,46],NEEDLE_L=[84,124,68];
export const LEAF_D=[54,100,44],LEAF_L=[104,156,70],POP_D=[72,110,48],POP_L=[132,168,76],OAK_D=[52,94,42],OAK_L=[96,142,64];
export const FROND_D=[70,120,52],FROND_L=[118,168,74],DEAD=[124,100,64];

// --- builders, in real metres: H tall, W across ---
export function spire(m,H,W,T){
  // A sapling's few layers are far apart, so its trunk runs up through them, and each layer reaches into the next.
  const small=T<4;
  stem(m,[[0,0,0],[0,H*(small?.86:.28),0]],[Math.max(.04,W*.06),Math.max(.03,W*.035)*(small?.6:1)],small?4:5,BARK);
  const n=small?6:7;
  for(let i=0;i<T;i++){const t=T>1?i/(T-1):0,y0=H*(.04+.7*t+(i?.035/T*jr()*2:0)),y1=i===T-1?H:y0+H*(.34-.14*t)*(1+.12*jr())*(small?1.45:1),r=W/2*Math.pow(1-.82*t,.9)*(1+.08*jr());
    const A=ring(m,0,y0,0,r,n,i*.9+jr(),mixc(SPRUCE_D,SPRUCE_L,t*.3),.08);apex(m,A,m.v(0,y1,0,mixc(SPRUCE_L,SPRUCE_D,.1)));if(i===0)fan(m,A)}
}
// Young pines: rings of flat clumps (one ring a year), gaps between, a tuft on top.
export function pineWhorls(m,H,W,bare,rings){
  const lean=[W*.04*jr(),W*.04*jr()];
  stem(m,[[0,0,0],[W*.03*jr(),H*.5,W*.03*jr()],[lean[0],H*.97,lean[1]]],[W*.045,W*.03,W*.015],4,PINEBARK);
  const counts=[5,3,4,3,2];
  for(let k=0;k<rings;k++){const t=rings>1?k/(rings-1):0,y=H*(bare+(.84-bare)*t+.04*jr()),n=counts[k%counts.length]-(t>.6?1:0);
    let a=jr()*6.28;
    for(let j=0;j<n;j++){a+=6.28/n*(1+.5*jr());const reach=W*(.24-.13*t)*(1+.45*jr()),sz=1+.5*jr(),cx=lean[0]*t+Math.cos(a)*reach,cz=lean[1]*t+Math.sin(a)*reach;
      pad(m,cx,y+H*.05*jr(),cz,W*(.3-.12*t)*sz,H*.07*(1+.3*jr()),W*(.26-.1*t)*sz,NEEDLE_L,NEEDLE_D,a)}}
  pad(m,lean[0]+W*.04,H*.94,lean[1],W*.12,H*.07,W*.1,NEEDLE_L,NEEDLE_D,.3);
}
export function pineCrown(m,H,W,bare,P){
  // A straight bare trunk, then a wide, flat-topped, uneven crown: a core and clumps reaching out to the sides.
  const tr=W*.035;stem(m,[[0,0,0],[W*.02,H*.5,0],[-W*.015,H*.85,W*.01],[0,H*.93,0]],[tr,tr*.8,tr*.55,tr*.35],5,PINEBARK);
  ico(m,0,H*.86,0,W*.24,H*.07,W*.22,NEEDLE_L,NEEDLE_D,.15);
  for(let k=0;k<P;k++){const t=P>1?k/(P-1):0,y=H*(bare+.06+(.88-bare-.06)*t),a=k*2.4+.4*jr(),reach=W*(.27-.08*t)*(1+.15*jr());
    stem(m,[[0,y-H*.02,0],[Math.cos(a)*reach*.7,y,Math.sin(a)*reach*.7]],[tr*.35,tr*.2],3,PINEBARK);
    ico(m,Math.cos(a)*reach,y,Math.sin(a)*reach,W*(.3-.06*t),H*.05,W*(.27-.06*t),NEEDLE_L,NEEDLE_D,.18)}
}
export function column(m,H,W,thin){
  stem(m,[[0,0,0],[0,H*.1,0]],[W*.08,W*.07],thin?4:5,BARK);
  const A=ring(m,0,H*.04,0,W*.34,7,0,[38,74,46],.06),B=ring(m,0,H*.36,0,W*.5,7,.4,[50,90,56],.08),C=ring(m,0,H*.7,0,W*.36,7,.8,[62,106,64],.08);
  [B,C].forEach((R,j)=>R.forEach((id,k)=>{m.pos[id*3+1]+=(k%2?1:-1)*H*(.025+.01*j)}));
  band(m,A,B);band(m,B,C);apex(m,C,m.v(0,H,0,[74,120,72]));fan(m,A);
}
// Broadleaf: trunk to `clear`, then blobs [x,y,z,rx,ry,rz] in units of W (x,z,rx,rz) and H (y,ry).
export function broad(m,H,W,trunkR,clear,bark,blobs,cl,cd,limbs=[]){
  stem(m,[[0,0,0],[W*.02,H*clear,0]],[trunkR,trunkR*.7],trunkR<.08?4:5,bark);
  for(const[x,y,z]of limbs)stem(m,[[0,H*clear*.85,0],[W*x,H*y,W*z]],[trunkR*.45,trunkR*.25],3,bark);
  for(const[x,y,z,rx,ry,rz]of blobs)ico(m,W*x,H*y,W*z,W*rx,H*ry,W*rz,cl,cd,.14);
}
// --- palms. All growth is from one bud at the top; the trunk is full width from the start;
// the crown keeps the same size for life and only the trunk lengthens under it. ---
export const COCO_BARK=[[132,114,92],[112,96,78]],FAN_BARK=[118,104,86],SKIRT=[112,88,58];
// Feather frond: a broad leaf, folded into a shallow roof along its midrib, on an arching midrib. 12 triangles.
export function feather(m,base,a,L,e0,bend,hw,c0,c1){
  const dx=Math.cos(a),dz=Math.sin(a),sx=-dz,sz=dx,fr=[0,.28,.64,1],wid=[.05,1,.72,.06];
  let p=base.slice(),e=e0;const mids=[p];
  for(let i=1;i<4;i++){const seg=L*(fr[i]-fr[i-1]);p=[p[0]+dx*Math.cos(e)*seg,p[1]+Math.sin(e)*seg,p[2]+dz*Math.cos(e)*seg];mids.push(p);e-=bend}
  const ids=mids.map((q,i)=>{const w=hw*wid[i],c=mixc(c0,c1,i/3);return[m.v(q[0],q[1],q[2],c),m.v(q[0]+sx*w,q[1]-w*.22,q[2]+sz*w,c),m.v(q[0]-sx*w,q[1]-w*.22,q[2]-sz*w,c)]});
  for(let i=0;i<3;i++){const[a0,l0,r0]=ids[i],[a1,l1,r1]=ids[i+1];m.idx.push(a0,l0,l1,a0,l1,a1,a0,a1,r1,a0,r1,r0)}
}
// A crown: a spear standing up in the middle, most fronds arching out, the oldest hanging.
export function featherCrown(m,top,n,L,hw,low){
  for(let k=0;k<n;k++){const t=n>1?k/(n-1):0,a=k*2.399+.25*jr();
    feather(m,top,a,L*(t<.15?.75:1)*(1+.06*jr()),1.12-(1.12-low)*t,.34+.18*t,hw*(t<.15?.6:1),mixc(FROND_L,FROND_D,t*.6),mixc(FROND_L,[96,130,60],t))}
}
export function coconutTrunk(m,T,lean){
  // ringed trunk, slightly swollen at the foot, leaning more towards the top
  let prev=null;const N=6;
  for(let i=0;i<=N;i++){const t=i/N,r=i===0?.26:.18-.03*t,R=ring(m,lean*t*t,T*t,0,r,5,0,COCO_BARK[i%2]);if(prev)band(m,prev,R);prev=R}
}
export function featherPalm(m,T,lean,n){
  if(T>0)coconutTrunk(m,T,lean);
  featherCrown(m,[lean,Math.max(T,.3),0],n,4.6,.72,-.55);
  for(let i=1;i<m.pos.length;i+=3)m.pos[i]=Math.max(m.pos[i],.03);   // low fronds rest on the ground, never through it
}
export function featherSeedling(m){for(let k=0;k<4;k++)feather(m,[0,.05,0],k*1.7,1.0,1.25,.35,.06,FROND_L,FROND_D)}
// Fan leaf (Washingtonia): a stalk, then a big fan: flat fingers (12 triangles) or folded (8 triangles).
export const FAN_L=[112,156,72],FAN_D=[70,112,52];
export function fanLeaf(m,base,a,el,stalk,R,c0,c1,flat=false){
  const d=[Math.cos(a)*Math.cos(el),Math.sin(el),Math.sin(a)*Math.cos(el)];let s=norm(cross(d,[0,1,0])),n=norm(cross(s,d));
  // A flat leaf is turned about its stalk by a random amount, so the fans face every which way.
  if(flat){const r=1.25*2*jr(),c=Math.cos(r),q=Math.sin(r),s2=[s[0]*c+n[0]*q,s[1]*c+n[1]*q,s[2]*c+n[2]*q];n=norm(cross(s2,d));s=s2}
  const P=[base[0]+d[0]*stalk,base[1]+d[1]*stalk,base[2]+d[2]*stalk],w=.05;
  const b0=m.v(base[0]+s[0]*w,base[1],base[2]+s[2]*w,c0),b1=m.v(base[0]-s[0]*w,base[1],base[2]-s[2]*w,c0),pc=m.v(...P,c0),p1=m.v(P[0]-s[0]*w,P[1],P[2]-s[2]*w,c0);
  m.idx.push(b0,b1,pc,b1,p1,pc);
  if(flat){
    // Flat: narrow fingers radiating from the end of the stalk, with gaps between them, as the
    // real leaf's segments do; each finger is one triangle, its tip a little longer or shorter.
    const F=10,span=3.5;
    for(let f=0;f<F;f++){const a0=-span/2+span*(f+.12)/F,a1=-span/2+span*(f+.88)/F,r=R*(.9+.1*jr()),tip=(a,rr)=>m.v(P[0]+rr*(Math.cos(a)*d[0]+Math.sin(a)*s[0]),P[1]+rr*(Math.cos(a)*d[1]+Math.sin(a)*s[1]),P[2]+rr*(Math.cos(a)*d[2]+Math.sin(a)*s[2]),c1);
      m.idx.push(pc,tip(a0,r),tip(a1,r))}
    return;
  }
  const K=6,rim=[];
  // Not flat (the young palms, as Jim preferred them): a fan with folds and drooping tips.
  for(let i=0;i<=K;i++){const f=-1.7+3.4*i/K,c=Math.cos(f),sn=Math.sin(f),r=R*(i%2?1:.78),pl=flat?0:(i%2?.1:-.05)*R,drop=flat?0:R*(.18+.32*Math.abs(sn));
    rim.push(m.v(P[0]+r*(c*d[0]+sn*s[0])+pl*n[0],P[1]+r*(c*d[1]+sn*s[1])+pl*n[1]-drop,P[2]+r*(c*d[2]+sn*s[2])+pl*n[2],c1))}
  for(let i=0;i<K;i++)m.idx.push(pc,rim[i],rim[i+1]);
}
export function fanCrown(m,top,n,stalk,R,low,flat=false){
  for(let k=0;k<n;k++){const t=n>1?k/(n-1):0;
    fanLeaf(m,top,k*2.399+.2*jr(),1.2-(1.2-low)*t,stalk*(1+.1*jr()),R*(1+.08*jr()),mixc(FAN_L,FAN_D,.5+.3*t),mixc(FAN_L,[96,132,60],t),flat)}
}
// Tall slim trunk, flared at the foot; a tight skirt of dead leaves hanging right under the crown.
export function fanPalm(m,T,skirt,n){
  if(T>0){stem(m,[[0,0,0],[0,.6,0],[0,T*.5,0],[0,T,0]],[.46,.33,.27,.22],6,FAN_BARK);
    if(skirt>0){const A=ring(m,0,T+.15,0,.8,8,0,[150,122,82],.1),B=ring(m,0,T-skirt*.55,0,.62,8,.2,SKIRT,.12),C=ring(m,0,T-skirt,0,.42,8,.4,[96,74,48],.1);
      C.forEach((id,k)=>{m.pos[id*3+1]+=(k%2?.35:-.15)});band(m,A,B);band(m,B,C)}}
  fanCrown(m,[0,Math.max(T,.25)+.3,0],n,T>0?1.1:1.5,1.15,-.75,T>0);   // trunked palms have flat leaves
  for(let i=1;i<m.pos.length;i+=3)m.pos[i]=Math.max(m.pos[i],.03);
}

// Each style: growth stages (built in metres), and one simple far shape (unit size, stretched).
