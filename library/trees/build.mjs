// Trees: one shape per growth stage of each style, plus one simple far shape per
// style. Every shape is in real metres. The app stretches each tree by up to
// 10% either way, and stretches the far shape to the tree it stands in for.
import * as S from '../shapes.mjs';
const { Mesh, reseed, jr, mixc, ring, band, apex, fan, cone, stem, ico, octa, lump, fronds, pad } = S;
// Bring every helper and colour into scope, as the builders were written with them.
const { BARK, PINEBARK, PALMBARK, BIRCH, SPRUCE_D, SPRUCE_L, NEEDLE_D, NEEDLE_L, LEAF_D, LEAF_L, POP_D, POP_L, OAK_D, OAK_L,
  FROND_D, FROND_L, DEAD, COCO_BARK, FAN_BARK, SKIRT, FAN_L, FAN_D,
  spire, pineWhorls, pineCrown, column, broad, featherPalm, featherSeedling, fanCrown, fanPalm } = S;

export const STAGE_NAMES = {
  spire: ['sapling', 'young', 'mature', 'old'],
  pine: ['sapling', 'pole', 'mature', 'old'],
  column: ['sapling', 'young', 'mature'],
  round: ['sapling', 'young', 'mature', 'old'],
  oval: ['sapling', 'young', 'mature', 'old'],
  spread: ['sapling', 'young', 'mature', 'old'],
  feather: ['seedling', 'young, no trunk', 'trunked', 'mature'],
  fan: ['seedling', 'young, no trunk', 'trunked', 'mature'],
};

export const STYLES=[
  {key:"spire",name:"Spire",like:"Spruce, fir",conifer:true,stages:[
    [m=>spire(m,2.4,1.1,3)],[m=>spire(m,7,2.6,5)],[m=>spire(m,17,5.2,7)],[m=>spire(m,30,8,9)]],
   far(m){cone(m,.06,1,.46,5,[34,66,44],[58,102,60])}},
  {key:"pine",name:"Pine",like:"Pine",conifer:true,stages:[
    [m=>pineWhorls(m,3.5,2.2,.14,4)],[m=>pineWhorls(m,10,3.8,.42,4)],[m=>pineCrown(m,20,7,.55,5)],[m=>pineCrown(m,27,10,.62,5)]],
   far(m){stem(m,[[0,0,0],[.02,.6,0]],[.026,.018],3,[100,84,70]);lump(m,0,.7,0,.34,.2,.32,NEEDLE_L,NEEDLE_D);lump(m,.04,.87,.02,.25,.14,.23,NEEDLE_L,NEEDLE_D)}},   // a pine top in a canopy: grey-brown trunk, taller rounder crown
  {key:"column",name:"Column",like:"Cedar, cypress",conifer:true,stages:[
    [m=>column(m,3,.9,true)],[m=>column(m,8,2.3)],[m=>column(m,14,3.8)]],
   far(m){const A=ring(m,0,.04,0,.38,5,0,[40,76,48],.1),B=ring(m,0,.45,0,.5,5,.6,[52,92,58],.14);band(m,A,B);apex(m,B,m.v(.03,1,.02,[70,114,70]));fan(m,A)}},
  {key:"round",name:"Round",like:"Maple, oak, lime",conifer:false,stages:[
    [m=>broad(m,3.5,1.5,.04,.55,BARK,[[.12,.72,0,.28,.13,.26],[-.14,.86,.08,.22,.1,.22]],LEAF_L,LEAF_D,[[.12,.7,0],[-.14,.84,.08]])],
    [m=>broad(m,8,4,.11,.42,BARK,[[0,.68,0,.4,.22,.4],[.18,.58,.1,.26,.16,.26]],LEAF_L,LEAF_D,[[.18,.58,.1],[-.14,.64,-.08]])],
    [m=>broad(m,15,10,.3,.4,BARK,[[0,.68,0,.44,.3,.44],[.22,.56,.12,.27,.21,.27],[-.2,.58,-.14,.27,.21,.27]],LEAF_L,LEAF_D,[[.22,.55,.12],[-.2,.57,-.14]])],
    [m=>broad(m,20,15,.45,.36,BARK,[[0,.7,0,.4,.26,.4],[.28,.55,.1,.24,.2,.24],[-.26,.56,-.12,.24,.2,.24],[.04,.52,.3,.22,.18,.2],[-.06,.88,-.04,.24,.12,.24]],LEAF_L,LEAF_D,[[.25,.5,.1],[-.24,.52,-.1]])]],
   far(m){stem(m,[[0,0,0],[0,.6,0]],[.05,.03],3,BARK);lump(m,.06,.62,.03,.4,.3,.38,LEAF_L,LEAF_D);lump(m,-.12,.72,-.06,.32,.24,.3,LEAF_L,LEAF_D)}},
  {key:"oval",name:"Tall oval",like:"Poplar, birch",conifer:false,stages:[
    [m=>broad(m,4,1.2,.035,.68,BIRCH,[[0,.74,0,.4,.25,.4]],POP_L,POP_D)],
    [m=>broad(m,10,3.2,.1,.52,BIRCH,[[0,.55,0,.42,.26,.42],[.04,.83,0,.3,.17,.3]],POP_L,POP_D)],
    [m=>broad(m,18,6,.2,.52,BIRCH,[[0,.56,0,.4,.3,.4],[.04,.84,0,.27,.16,.27]],POP_L,POP_D)],
    [m=>broad(m,25,8.5,.3,.46,BIRCH,[[0,.48,0,.38,.22,.38],[.06,.72,.04,.36,.18,.34],[0,.9,0,.22,.1,.22]],POP_L,POP_D)]],
   far(m){stem(m,[[0,0,0],[0,.3,0]],[.04,.03],3,BIRCH);lump(m,0,.5,0,.4,.3,.4,POP_L,POP_D);lump(m,.05,.78,.02,.3,.22,.28,POP_L,POP_D)}},
  {key:"spread",name:"Spreading",like:"Old oak, acacia",conifer:false,stages:[
    [m=>broad(m,3.2,1.6,.04,.75,BARK,[[0,.86,0,.4,.12,.36]],OAK_L,OAK_D)],
    [m=>broad(m,6,4.5,.1,.45,BARK,[[.2,.72,.05,.32,.14,.3],[-.2,.76,-.08,.3,.13,.3]],OAK_L,OAK_D,[[.2,.68,.05],[-.2,.72,-.08]])],
    [m=>broad(m,11,12,.3,.32,BARK,[[.24,.62,.06,.3,.18,.3],[-.23,.6,-.1,.3,.18,.3],[0,.74,.1,.3,.17,.28]],OAK_L,OAK_D,[[.26,.52,.06],[-.24,.5,-.08]])],
    [m=>broad(m,15,20,.5,.28,BARK,[[.3,.58,.05,.22,.14,.22],[-.28,.56,-.1,.22,.14,.22],[.02,.66,.28,.22,.13,.2],[-.04,.68,-.28,.2,.13,.2],[0,.8,0,.28,.13,.28]],OAK_L,OAK_D,[[.3,.5,.05],[-.28,.48,-.1],[.02,.55,.28],[-.04,.56,-.28]])]],
   far(m){   // worked out from the mature shape: its trunk, two limbs and three clumps, each made simple
     stem(m,[[0,0,0],[.02,.32,0]],[.07,.05],3,BARK);stem(m,[[0,.27,0],[.26,.52,.06]],[.035,.022],3,BARK);stem(m,[[0,.27,0],[-.24,.5,-.08]],[.035,.022],3,BARK);
     lump(m,.24,.62,.06,.3,.18,.3,OAK_L,OAK_D);lump(m,-.23,.6,-.1,.3,.18,.3,OAK_L,OAK_D);lump(m,0,.74,.1,.3,.17,.28,OAK_L,OAK_D)}},
  {key:"feather",name:"Feather palm",like:"Coconut",conifer:false,stages:[
    [m=>featherSeedling(m)],[m=>featherPalm(m,0,0,12)],[m=>featherPalm(m,3,.3,14)],[m=>featherPalm(m,14,1.6,14)]],
   far(m){stem(m,[[0,0,0],[.04,.45,0],[.12,.85,0]],[.025,.02,.018],3,COCO_BARK[0]);for(let k=0;k<6;k++)fronds(m,[.12,.86,0],1,.5*(1+.22*jr()),.16+.14*jr(),.08,FROND_D,FROND_L,k*1.05+.45*jr(),1)}},   // six fronds, each its own angle, length and droop
  {key:"fan",name:"Fan palm",like:"Washingtonia",conifer:false,stages:[
    [m=>fanCrown(m,[0,.05,0],4,.45,.35,.7,true)],[m=>fanPalm(m,0,0,12)],[m=>fanPalm(m,4,3.4,20)],[m=>fanPalm(m,18,4,22)]],
   far(m){stem(m,[[0,0,0],[0,.8,0]],[.03,.02],3,FAN_BARK);const A=ring(m,0,.86,0,.12,5,0,SKIRT),B=ring(m,0,.68,0,.06,5,.4,SKIRT);band(m,A,B);pad(m,0,.88,0,.5,.12,.5,FAN_L,FAN_D,0,.2)}},
];

function extent(m) {
  let H = 0, W = 0;
  for (let i = 0; i < m.pos.length; i += 3) { H = Math.max(H, m.pos[i + 1]); W = Math.max(W, Math.abs(m.pos[i]), Math.abs(m.pos[i + 2])); }
  return { H, W: W * 2 };
}

// { 'spire-1': Mesh, ..., 'spire-far': Mesh, ... }
export function build() {
  const out = {};
  for (const s of STYLES) {
    let last = null;
    s.stages.forEach(([make], i) => { reseed(); const m = new Mesh(); make(m); out[`${s.key}-${i + 1}`] = m; last = m; });
    // The far shape is drawn at unit size, then set to the oldest stage's size here.
    reseed(); const f = new Mesh(); s.far(f);
    const a = extent(f), b = extent(last);
    for (let i = 0; i < f.pos.length; i += 3) { f.pos[i] *= b.W / a.W; f.pos[i + 1] *= b.H / a.H; f.pos[i + 2] *= b.W / a.W; }
    out[`${s.key}-far`] = f;
  }
  return out;
}
