/* ---------- Silhouettes animées (v3, appuis fixes) ----------
   Vue de profil, la personne regarde vers la droite. Coordonnées absolues (240 × 170), sol à y=152.
   H : bassin [x,y] · N : cou visé (tronc droit) ou t:[t1,t2] (0 = vertical, + = penché en avant)
   Membres : soit angles [seg1, seg2, pied relatif] (0 = vers le bas, + = vers l'avant),
   soit cible {to:[x,y], bend:±1, foot:angle absolu | "along"} résolue en cinématique inverse :
   un appui au sol garde la même cible d'une image à l'autre, donc il ne glisse pas. */
const FIG={W:240,H:170,G:152,T:22,UA:23,FA:21,TH:29,SH:29,FT:10,HEAD:9};
const FY=149, HY=92;
const rad=d=>d*Math.PI/180, deg=r=>r*180/Math.PI;
const dn=(a,L)=>[Math.sin(rad(a))*L,Math.cos(rad(a))*L];
const up=(t,L)=>[Math.sin(rad(t))*L,-Math.cos(rad(t))*L];
const add=(p,v)=>[p[0]+v[0],p[1]+v[1]];
const leg=(x,y,o)=>Object.assign({to:[x,y],bend:-1,foot:90},o||{});
const arm=(x,y,o)=>Object.assign({to:[x,y],bend:1},o||{});
const toe=(tx,d)=>[tx-10*Math.sin(rad(d)),FY-10*Math.cos(rad(d))]; // cheville pour une pointe posée en tx, pied à l'angle d
function stand(x,o){return Object.assign({H:[x,HY],t:[0,0],h:0,na:[8,14],fa:[-6,-2],nl:leg(x+1,FY),fl:leg(x-1,FY)},o||{})}
function lying(hx,y,o){return Object.assign({H:[hx,y],N:[hx+44,y],h:0,na:[-88,-90],fa:[-86,-90]},o||{})}

const ANIMS={
  march:{dur:1100,keys:[
    stand(120,{nl:leg(134,124,{foot:70}),fl:leg(119,FY),na:[-35,-15],fa:[35,75]}),
    stand(120,{nl:leg(121,FY),fl:leg(132,124,{foot:70}),na:[35,75],fa:[-35,-15]})]},
  ankleCircles:{dur:1300,focus:["nA"],keys:[
    stand(118,{H:[118,HY],nl:leg(140,136,{foot:55}),fl:leg(118,FY),na:[-25,40],fa:[-25,40]}),
    stand(118,{H:[118,HY],nl:leg(140,136,{foot:125}),fl:leg(118,FY),na:[-25,40],fa:[-25,40]})]},
  kneeWall:{dur:1800,focus:["nK"],props:[{type:"wall",x:142}],keys:[
    {H:[104,98],t:[6,6],nl:leg(128,FY),fl:leg(86,FY,{foot:90}),na:arm(138,62),fa:arm(137,64)},
    {H:[110,102],t:[9,9],nl:leg(128,FY),fl:leg(86,FY,{foot:90}),na:arm(138,62),fa:arm(137,64)}]},
  hipCircles:{dur:1500,front:true,keys:[
    {H:[115,HY],t:[-12,-6],na:[38,-45],fa:[-38,45],nl:leg(129,FY,{bend:1}),fl:leg(111,FY,{bend:-1,foot:-90})},
    {H:[125,HY],t:[12,6],na:[38,-45],fa:[-38,45],nl:leg(129,FY,{bend:1}),fl:leg(111,FY,{bend:-1,foot:-90})}]},
  lungeRot:{dur:2800,keys:[
    stand(96,{nl:leg(98,FY),fl:leg(...toe(104,90),{foot:90})}),
    {H:[110,100],t:[2,2],na:[40,60],fa:[-20,10],nl:leg(132,136,{foot:80}),fl:leg(...toe(100,60),{foot:60})},
    {H:[126,114],t:[2,2],na:[75,85],fa:[-50,-10],nl:leg(160,FY),fl:leg(...toe(100,40),{foot:40})},
    {H:[110,100],t:[2,2],na:[40,60],fa:[-20,10],nl:leg(132,136,{foot:80}),fl:leg(...toe(100,60),{foot:60})}]},
  lungeBack:{dur:2600,keys:[
    stand(122,{nl:leg(120,FY),fl:leg(124,FY)}),
    {H:[118,98],t:[3,3],na:[20,40],fa:[-15,10],nl:leg(104,138,{foot:60}),fl:leg(124,FY)},
    {H:[110,112],t:[3,3],na:[25,45],fa:[-20,5],nl:leg(...toe(88,40),{foot:40}),fl:leg(124,FY)},
    {H:[118,98],t:[3,3],na:[20,40],fa:[-15,10],nl:leg(104,138,{foot:60}),fl:leg(124,FY)}]},
  catCow:{dur:3400,keys:[
    {H:[112,118],t:[84,64],h:-30,na:arm(153,FY),fa:arm(151,FY),nl:leg(83,147,{foot:-90}),fl:leg(82,147,{foot:-90})},
    {H:[112,118],t:[62,86],h:40,na:arm(153,FY),fa:arm(151,FY),nl:leg(83,147,{foot:-90}),fl:leg(82,147,{foot:-90})}]},
  birdDog:{dur:3200,keys:[
    {H:[112,118],t:[74,74],h:15,na:arm(153,FY),fa:arm(151,FY),nl:leg(83,147,{foot:-90}),fl:leg(82,147,{foot:-90})},
    {H:[112,118],t:[74,74],h:15,na:arm(199,104),fa:arm(151,FY),nl:leg(83,147,{foot:-90}),fl:leg(55,117,{foot:"along"})}]},
  thoracic:{dur:3200,keys:[
    lying(110,145,{nl:leg(62,146,{bend:1,foot:-90}),fl:leg(61,147,{bend:1,foot:-90}),na:[90,90],fa:[88,88]}),
    lying(110,145,{nl:leg(62,146,{bend:1,foot:-90}),fl:leg(61,147,{bend:1,foot:-90}),na:[255,255],fa:[88,88]})]},
  legSwing:{dur:1400,keys:[
    stand(112,{t:[3,3],na:[-25,40],fa:[-25,40],nl:[-40,-45,0],fl:leg(112,FY)}),
    stand(112,{t:[-3,-3],na:[-25,40],fa:[-25,40],nl:[60,55,0],fl:leg(112,FY)})]},
  calfIso:{dur:2200,focus:["nA"],keys:[
    stand(118,{H:[118,HY-6.5],nl:leg(...toe(129,50),{foot:50}),fl:leg(...toe(127,50),{foot:50})}),
    stand(118,{H:[118,HY-7.3],nl:leg(...toe(129,46),{foot:46}),fl:leg(...toe(127,46),{foot:46})})]},
  calfRaise:{dur:6000,focus:["nA"],keys:[
    stand(118,{nl:leg(...toe(129,90),{foot:90}),fl:leg(...toe(127,90),{foot:90})}),
    stand(118,{H:[118,HY-8],nl:leg(...toe(129,35),{foot:35}),fl:leg(...toe(127,35),{foot:35})})]},
  bridge:{dur:3000,focus:["H"],keys:[
    {H:[118,147],N:[162,147],h:0,na:[-88,-90],fa:[-86,-90],nl:leg(92,FY,{bend:1,foot:-90}),fl:leg(91,FY,{bend:1,foot:-90})},
    {H:[122,128],N:[162,147],h:-25,na:[-88,-90],fa:[-86,-90],nl:leg(92,FY,{bend:1,foot:-90}),fl:leg(91,FY,{bend:1,foot:-90})}]},
  bridgeOne:{dur:3000,focus:["H"],keys:[
    {H:[118,147],N:[162,147],h:0,na:[-88,-90],fa:[-86,-90],nl:leg(92,FY,{bend:1,foot:-90}),fl:leg(66,128,{bend:1,foot:"along"})},
    {H:[122,128],N:[162,147],h:-25,na:[-88,-90],fa:[-86,-90],nl:leg(92,FY,{bend:1,foot:-90}),fl:leg(70,103,{bend:1,foot:"along"})}]},
  abduction:{dur:2200,keys:[
    lying(120,145,{na:[-100,-82],fa:[90,90],nl:leg(62,143,{bend:1,foot:"along"}),fl:leg(62,147,{bend:1,foot:"along"})}),
    lying(120,145,{na:[-100,-82],fa:[90,90],nl:leg(73,112,{bend:1,foot:"along"}),fl:leg(62,147,{bend:1,foot:"along"})})]},
  balance:{dur:3000,keys:[
    {H:[119,93],t:[3,3],na:[45,50],fa:[-40,-35],nl:leg(121,FY),fl:leg(100,126,{foot:20})},
    {H:[121,93],t:[-2,-2],na:[40,45],fa:[-45,-40],nl:leg(121,FY),fl:leg(101,127,{foot:20})}]},
  plank:{dur:2600,focus:["H"],keys:[
    {H:[106.5,130.6],N:[150,124],h:8,na:arm(171,147),fa:arm(169,147),nl:leg(...toe(46,-15),{foot:-15}),fl:leg(...toe(45,-15),{foot:-15})},
    {H:[106.5,132],N:[150,124],h:8,na:arm(171,147),fa:arm(169,147),nl:leg(...toe(46,-15),{foot:-15}),fl:leg(...toe(45,-15),{foot:-15})}]},
  sidePlank:{dur:2600,front:true,focus:["H"],keys:[
    {H:[107,129],N:[150,124],h:-6,na:arm(160,147),fa:[180,180],nl:leg(51,145,{foot:-90}),fl:leg(52,141,{foot:-90})},
    {H:[107,132],N:[150,124],h:-6,na:arm(160,147),fa:[180,180],nl:leg(51,145,{foot:-90}),fl:leg(52,141,{foot:-90})}]},
  deadBug:{dur:2800,keys:[
    lying(122,145,{na:[180,180],fa:[182,182],nl:leg(93,116,{bend:1,foot:180}),fl:leg(94,117,{bend:1,foot:180})}),
    lying(122,145,{na:[104,104],fa:[182,182],nl:leg(93,116,{bend:1,foot:180}),fl:leg(66,139,{bend:1,foot:"along"})})]},
  pushup:{dur:2400,keys:[
    {H:[109.7,121.6],N:[152,105],h:10,na:arm(152,FY),fa:arm(150,FY),nl:leg(...toe(52,-20),{foot:-20}),fl:leg(...toe(51,-20),{foot:-20})},
    {H:[112.6,133],N:[156,128],h:10,na:arm(152,FY),fa:arm(150,FY),nl:leg(...toe(52,-20),{foot:-20}),fl:leg(...toe(51,-20),{foot:-20})}]},
  row:{dur:2200,props:[{type:"band",from:"nW",x:218,y:56},{type:"post",x:218,y:56}],keys:[
    stand(96,{H:[96,95],t:[6,6],na:[85,88],fa:[83,86],nl:leg(100,FY),fl:leg(94,FY)}),
    stand(96,{H:[96,95],t:[4,4],na:[-35,90],fa:[-33,90],nl:leg(100,FY),fl:leg(94,FY)})]},
  lateralRaise:{dur:2400,front:true,props:[{type:"weight",at:"nW"},{type:"weight",at:"fW"}],keys:[
    stand(120,{na:[8,8],fa:[-8,-8],nl:leg(128,FY,{bend:1}),fl:leg(112,FY,{foot:-90})}),
    stand(120,{na:[88,88],fa:[-88,-88],nl:leg(128,FY,{bend:1}),fl:leg(112,FY,{foot:-90})})]},
  legsWall:{dur:4000,props:[{type:"wall",x:108}],keys:[
    lying(116,145,{nl:leg(114,88,{foot:"along"}),fl:leg(113,89,{foot:"along"})}),
    lying(116,145,{h:-4,nl:leg(114,88,{foot:"along"}),fl:leg(113,89,{foot:"along"})})]},
  gluteStretch:{dur:3200,focus:["nA"],keys:[
    lying(130,145,{na:arm(128,125),fa:arm(127,126),fl:leg(104,FY,{bend:1,foot:-90}),nl:leg(115,118,{bend:1,foot:120})}),
    lying(130,145,{na:arm(136,120),fa:arm(135,121),fl:leg(110,124,{bend:1,foot:-60}),nl:leg(139,113,{bend:1,foot:120})})]},
  stepDown:{dur:3200,props:[{type:"step",x0:92,x1:132,y:128}],keys:[
    {H:[114,70],t:[5,5],na:[50,70],fa:[46,66],nl:leg(116,126),fl:leg(140,124,{foot:100})},
    {H:[112,95],t:[20,20],na:[65,80],fa:[60,76],nl:leg(116,126),fl:leg(140,145,{foot:110})}]},
  wallSit:{dur:3000,focus:["nK"],props:[{type:"wall",x:104}],keys:[
    {H:[110,120],t:[0,0],na:[20,75],fa:[18,72],nl:leg(139,FY),fl:leg(137,FY)},
    {H:[110,120.5],t:[0,0],na:[22,76],fa:[20,73],nl:leg(139,FY),fl:leg(137,FY)}]},
  shortFoot:{dur:2000,focus:["nT"],props:[{type:"chair",x0:86,x1:112,y:123}],keys:[
    {H:[104,120],t:[0,0],na:[30,80],fa:[28,78],nl:leg(133,FY),fl:leg(131,FY)},
    {H:[104,120],t:[0,0],na:[30,80],fa:[28,78],nl:leg(133,FY,{foot:84}),fl:leg(131,FY)}]}
};
const ANIM_BY_NAME=[
  [/marche|jumping/i,"march"],[/cercles? de chevilles/i,"ankleCircles"],[/genou.?mur/i,"kneeWall"],[/cercles? de hanches/i,"hipCircles"],
  [/fente avant|rotation/i,"lungeRot"],[/chat.?vache/i,"catCow"],[/thoraci/i,"thoracic"],[/balanc/i,"legSwing"],
  [/isom.*pointe/i,"calfIso"],[/mont.*pointe/i,"calfRaise"],[/pont.*(une|1) jambe/i,"bridgeOne"],[/pont/i,"bridge"],
  [/abduction/i,"abduction"],[/quilibre|unipodal/i,"balance"],[/planche lat/i,"sidePlank"],[/planche/i,"plank"],
  [/dead.?bug/i,"deadBug"],[/bird.?dog/i,"birdDog"],[/pompe/i,"pushup"],[/rowing/i,"row"],[/l[ée]vations? lat/i,"lateralRaise"],
  [/jambes au mur/i,"legsWall"],[/fessier|figure.?4/i,"gluteStretch"],[/step/i,"stepDown"],[/chaise/i,"wallSit"],
  [/short foot|serviette/i,"shortFoot"],[/fente/i,"lungeBack"]
];
function animFor(item){ if(!item) return null; if(item.anim&&ANIMS[item.anim]) return item.anim; const m=ANIM_BY_NAME.find(([re])=>re.test(item.name||"")); return m?m[1]:null; }

function solveLimb(root,spec,L1,L2){
  if(Array.isArray(spec)){
    const m=add(root,dn(spec[0],L1)), e=add(m,dn(spec[1],L2));
    return {m,e,foot:spec[1]+90+(spec[2]||0)};
  }
  const T=spec.to, dx=T[0]-root[0], dy=T[1]-root[1];
  let d=Math.hypot(dx,dy); d=Math.min(Math.max(d,Math.abs(L1-L2)+0.01),L1+L2-0.001);
  const base=Math.atan2(dy,dx), A=Math.acos((L1*L1+d*d-L2*L2)/(2*L1*d));
  const ang=base+(spec.bend||1)*A, m=[root[0]+L1*Math.cos(ang),root[1]+L1*Math.sin(ang)];
  const vx=T[0]-m[0], vy=T[1]-m[1], vl=Math.hypot(vx,vy)||1, e=[m[0]+vx/vl*L2,m[1]+vy/vl*L2];
  const along=deg(Math.atan2(e[0]-m[0],e[1]-m[1]));
  return {m,e,foot:spec.foot==="along"||spec.foot===undefined?along:spec.foot};
}
function solve(p){
  const J={}; J.H=p.H.slice(); let tHead;
  if(p.N){ const dx=p.N[0]-J.H[0], dy=p.N[1]-J.H[1], L=Math.hypot(dx,dy)||1, u=[dx/L,dy/L];
    J.M=[J.H[0]+u[0]*FIG.T,J.H[1]+u[1]*FIG.T]; J.N=[J.H[0]+u[0]*2*FIG.T,J.H[1]+u[1]*2*FIG.T]; tHead=deg(Math.atan2(u[0],-u[1])); }
  else { J.M=add(J.H,up(p.t[0],FIG.T)); J.N=add(J.M,up(p.t[1],FIG.T)); tHead=p.t[1]; }
  J.C=add(J.N,up(tHead+(p.h||0),FIG.HEAD+3));
  for(const s of ["n","f"]){
    const a=solveLimb(J.N,p[s+"a"],FIG.UA,FIG.FA); J[s+"E"]=a.m; J[s+"W"]=a.e;
    const l=solveLimb(J.H,p[s+"l"],FIG.TH,FIG.SH); J[s+"K"]=l.m; J[s+"A"]=l.e; J[s+"T"]=add(l.e,dn(l.foot,FIG.FT));
  }
  return J;
}
function lerpAny(a,b,u){
  if(typeof a==="number"&&typeof b==="number") return a+(b-a)*u;
  if(Array.isArray(a)&&Array.isArray(b)) return a.map((v,i)=>lerpAny(v,b[i]??v,u));
  if(Array.isArray(a)!==Array.isArray(b)) return u<0.5?a:b;
  if(a&&b&&typeof a==="object"&&typeof b==="object"){const o={};for(const k in a) o[k]=k in b?lerpAny(a[k],b[k],u):a[k];return o}
  return a;
}
function poseAt(anim,ms){
  const k=anim.keys, n=k.length; if(n<2) return k[0];
  const ph=((((ms%anim.dur)+anim.dur)%anim.dur)/anim.dur)*n, i=Math.floor(ph), u=(1-Math.cos((ph-i)*Math.PI))/2;
  return lerpAny(k[i],k[(i+1)%n],u);
}
function frameAt(anim,ms){return solve(poseAt(anim,ms))}
if(typeof module!=="undefined") module.exports={FIG,ANIMS,solve,poseAt,frameAt,animFor};
