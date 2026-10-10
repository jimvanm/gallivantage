// Run: node lab/leaf/one.mjs
// The 10-finger leaf on its own, upright and facing the viewer, exactly as on the sample palms
// (stalk 1 m, fingers 65 cm here, as in the earlier steps).
import { Mesh, norm, cross } from '../../library/shapes.mjs';
import { writeView, pack } from './view.mjs';
const add=(a,b,k=1)=>[a[0]+b[0]*k,a[1]+b[1]*k,a[2]+b[2]*k],turn=(u,v,t)=>add(u.map(x=>x*Math.cos(t)),v,Math.sin(t));
const m=new Mesh(),c0=[70,112,52],c1=[88,138,62],n=10,R=.65,curl=2*Math.PI/180;
const base=[0,0,0],d=[0,1,0],s=[1,0,0],nn=norm(cross(s,d)),w=.03,hub=add(base,d,1);
const b0=m.v(...add(base,s,w),c0),b1=m.v(...add(base,s,-w),c0),h0=m.v(...add(hub,s,w*.6),c0),h1=m.v(...add(hub,s,-w*.6),c0);m.idx.push(b0,b1,h1,b0,h1,h0);
const th=Math.PI/(n-1),hw=R*.3*th/.7/2;
for(let i=0;i<n;i++){const ang=-Math.PI/2+i*th,k=Math.abs(ang)/th;let dd=turn(d,s,ang),ss=turn(s,d,-ang);dd=turn(dd,nn,curl*k);
  const rr=R*(1-.2*Math.abs(ang)/(Math.PI/2));m.idx.push(m.v(...add(hub,ss,hw),c1),m.v(...add(hub,ss,-hw),c1),m.v(...add(hub,dd,rr),c1))}
const out={leaf10:m};
// Simpler: the same outline as a plain fan. Rim points sit where finger tips would, same lengths and cup;
// neighbouring points join to the stalk's end, one triangle per gap. No fingers, just the shape.
function plain(gaps){const m=new Mesh();const b0=m.v(...add(base,s,w),c0),b1=m.v(...add(base,s,-w),c0),h0=m.v(...add(hub,s,w*.6),c0),h1=m.v(...add(hub,s,-w*.6),c0);m.idx.push(b0,b1,h1,b0,h1,h0);
  const c=m.v(...hub,c1),th=Math.PI/gaps,rim=[];
  for(let i=0;i<=gaps;i++){const ang=-Math.PI/2+i*th;let dd=turn(d,s,ang);dd=turn(dd,nn,curl*Math.abs(ang)/(Math.PI/9));rim.push(m.v(...add(hub,dd,R*(1-.2*Math.abs(ang)/(Math.PI/2))),c1))}
  for(let i=0;i<gaps;i++)m.idx.push(c,rim[i],rim[i+1]);return m}
out.plain6=plain(6);out.plain4=plain(4);
writeView('leaf',{title:'Fan Palm Leaf',lede:'The approved ten-finger leaf, beside two plainer fans with the same outline.',
  models:Object.fromEntries(Object.entries(out).map(([k,v])=>[k,pack(v)])),
  order:[["leaf10","10 fingers · 12 triangles",-1.5,0],["plain6","Plain fan · 8 triangles",0,0],["plain4","Plain fan · 6 triangles",1.5,0]],
  cam:{tx:0,ty:1.1,tz:0,yaw:0,pitch:.1,dist:4.6},
  notes:`<section><h2>Shown here</h2><ul class="how">
    <li>Left: the approved leaf. A stalk (2 triangles), then 10 fingers (1 triangle each) from the stalk's end across a half-circle.</li>
    <li>Fingers meet the stalk 9.7 cm wide, so the middle reads solid. 65 cm long in the middle, 52 cm at the edges. A slight cup: 2 degrees more tilt per finger out from the middle.</li>
    <li>Right: the same outline, length and cup as a plain fan with no fingers, 6 and 4 slices.</li></ul></section>`});
