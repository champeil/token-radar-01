(()=>{
'use strict';
var D=window.RADAR;
if(!D)return;
var $=(id)=>{return document.getElementById(id);};
var mk=(tag,cls,txt)=>{
var n=document.createElement(tag);
if(cls)n.className=cls;
if(txt!==null&&txt!==undefined)n.textContent=String(txt);
return n;
};
var usd0=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
function money(n){
if(n===null||n===undefined||!isFinite(n))return 'n/a';
var a=Math.abs(n);
if(a>=1e12)return '$'+(n/1e12).toFixed(2)+'T';
if(a>=1e9)return '$'+(n/1e9).toFixed(2)+'B';
if(a>=1e6)return '$'+(n/1e6).toFixed(1)+'M';
if(a>=1e3)return '$'+Math.round(n/1e3)+'K';
return usd0.format(n);
}
function pct(n){
if(n===null||n===undefined||!isFinite(n))return 'n/a';
return(n>0?'+':'')+n.toFixed(2)+'%';
}
function pctClass(n){
if(n===null||n===undefined||!isFinite(n)||Math.abs(n)<0.005)return 'flat';
return n>0?'pos':'neg';
}
function age(days){
if(days===null||days===undefined)return 'unknown';
if(days>=730)return(days/365).toFixed(1)+'y';
if(days>=60)return Math.round(days/30)+'mo';
return Math.max(0,Math.round(days))+'d';
}
function mult(x){return x===null||x===undefined||!isFinite(x)?'n/a':x.toFixed(3)+'x';}
function recompute(row){
var m=D.model,f=row.model.factors;
var base=row.tvl_usd*f[0];
var growth=Math.min(m.growth_cap,Math.max(m.growth_floor,row.change_7d===null?0:row.change_7d));
var implied=Math.min(m.implied_cap,Math.max(1,Math.round(base*f[1]*f[2])));
return{growth:growth,growthMult:f[1],maturity:f[2],implied:implied,agrees:implied===row.implied_value_usd};
}
var cmpByCategory={};
(D.comparables||[]).forEach((c)=>{cmpByCategory[c.category]=c;});
(function stamp(){
var host=$('stamp');
[
['As of',D.as_of],
['Watchlist',D.watchlist_size+' protocols'],
['Board',D.board_size+' rows'],
['Live view',D.live_size+' protocols'],
['Set aside',D.product_size+' products'],
['Model',D.model_version]
].forEach((f)=>{
var d=mk('div');
d.append(mk('dt',null,f[0]),mk('dd',null,f[1]));
host.append(d);
});
})();
(function howto(){
var m=D.model;
$('howto-eq').textContent='implied FDV = category median mcap/TVL of live-token protocols x TVL x growth multiplier x maturity multiplier';
$('howto-stats').textContent='Global median multiple '+mult(D.global_multiple)+' · '+D.comparables.length+
' categories · '+D.global_comparables+' live-token comparables · '+D.snapshot_size+' protocols in the snapshot';
$('howto-note').textContent='Each category is priced off its own live-token peers; the global median applies only when a category has fewer than '+
m.min_comparables+' of them. Growth comes from the 7-day TVL change, maturity from age since listing.';
})();
(function explainer(){
var m=D.model;
$('explainer-lede').textContent=
'The model invents no multiple. Every figure it uses is already in the snapshot: a protocol is priced at the median mcap/TVL of the live-token protocols in its own category, times its own TVL. Nothing unrecorded is guessed. A protocol whose token already trades is priced by its market and stays out of this ranking; only one that records no token is estimated here, and the two never mix. One function scores every row; no name is special-cased.';
var steps=[
['Who is ranked',
'Ranked means the snapshot records no token for it and it is not a wrapped, staked or bridged product of one that trades: those hold other people\'s capital in transit, so TVL would flatter the value. '+D.product_size+' products are set aside; the '+D.live_size+' largest protocols whose token trades sit in their own view at market price, never the ranking.',
'ranked = records no token and not a product of one that trades'],
['Comparables set',
'Base multiple: every live-token protocol in the category (market cap recorded, TVL above zero, not an exchange) contributes its mcap/TVL, and the <b>median mcap / TVL</b> prices it. Under '+m.min_comparables+' live names a category borrows the global median over all '+D.global_comparables+', so lending is priced against lending, not a flat factor.',
'base = tvl_usd x median(mcap_i / tvl_i)'],
['Growth',
'Growth: the snapshot\'s change_7d clamped to ['+m.growth_floor+'%, +'+m.growth_cap+'%] and scaled by '+m.growth_weight+', so a hot week lifts value at most 42% and a collapse cuts it at most 21%; a null change counts as 0.',
'growthMult = 1 + (clamp(change_7d, '+m.growth_floor+', '+m.growth_cap+') / 100) x '+m.growth_weight],
['Maturity',
'Maturity: days since listed_at. A protocol that has run long with no token is the seasoned case the radar seeks, so age lifts value from '+m.maturity_floor.toFixed(2)+' at day 0 to '+(m.maturity_floor+m.maturity_range).toFixed(2)+' at '+m.maturity_days+' days; a missing listed_at takes '+m.neutral_maturity+'.',
'maturityMult = '+m.maturity_floor+' + min(age_days, '+m.maturity_days+') / '+m.maturity_days+' x '+m.maturity_range],
['Implied value',
'The three multiplied, rounded, floored at $1, capped at '+money(m.implied_cap)+'; rows sort by it. The board carries every watchlist slug (the '+money(D.floor_usd)+' TVL floor, records no token) plus the '+D.early_size+' other rankable protocols, above and below that floor.',
'implied = tvl x multiple x growthMult x maturityMult']
];
var host=$('formula');
steps.forEach((s,i)=>{
var li=mk('li');
var body=mk('div');
var head=mk('div');
head.innerHTML='<b>'+s[0]+'</b> '+s[1];
body.append(head,mk('code','eq',s[2]));
li.append(mk('span','n',String(i+1)),body);
host.append(li);
});
var consts=$('constants');
[
['min_comparables',m.min_comparables,'live names needed'],
['growth_weight',m.growth_weight,'weight on clamped 7d'],
['growth floor / cap',m.growth_floor+'% / +'+m.growth_cap+'%','clamp on change_7d'],
['maturity floor / range',m.maturity_floor+' / '+m.maturity_range,'at age 0, rising to '+(m.maturity_floor+m.maturity_range).toFixed(2)],
['maturity_days',m.maturity_days,'days to full rise'],
['neutral_maturity',m.neutral_maturity,'if listed_at is null'],
['global median',mult(D.global_multiple),'across '+D.global_comparables+' live protocols'],
['floor_usd',money(D.floor_usd),'watchlist floor']
].forEach((r)=>{
var v=mk('td',null,r[1]);
v.title=r[2];
var tr=mk('tr');
tr.append(mk('td',null,r[0]),v);
consts.append(tr);
});
var cmp=$('comparables');
var hr=mk('tr');
[['Category',''],['Live','num'],['Median mcap/TVL','num'],['Source','']].forEach((h)=>{
hr.append(mk('th',h[1],h[0]));
});
var head=mk('thead');
head.append(hr);
cmp.append(head);
var body=mk('tbody');
(D.comparables||[]).forEach((c)=>{
var tr=mk('tr');
var src=mk('td');
var pill=mk('span','pill '+(c.source==='category'?'cat':'glob'),c.source==='category'?'category':'global');
pill.title=c.source==='category'
?'Median of this category\'s '+c.comparables+' live-token protocols'
:'Fewer than '+m.min_comparables+' live names here: the global median is used';
src.append(pill);
tr.append(mk('td',null,c.category),mk('td','num',String(c.comparables)),mk('td','num',mult(c.multiple)),src);
body.append(tr);
});
cmp.append(body);
})();
var state={tab:'pre',q:'',category:'all',chain:'all',scope:'all',sort:'rank',dir:1};
var COLS=[
{key:'rank',label:'#',num:true},
{key:'name',label:'Protocol',num:false},
{key:'category',label:'Category',num:false},
{key:'chains',label:'Chains',num:false},
{key:'tvl_usd',label:'TVL',num:true},
{key:'change_7d',label:'7d',num:true},
{key:'age_days',label:'Age',num:true},
{key:'implied_value_usd',label:'Implied value',num:true}
];
var LIVE_COLS=[
{key:'rank',label:'#',num:true},
{key:'name',label:'Protocol',num:false},
{key:'category',label:'Category',num:false},
{key:'chains',label:'Chains',num:false},
{key:'tvl_usd',label:'TVL',num:true},
{key:'change_7d',label:'7d',num:true},
{key:'multiple',label:'mcap / TVL',num:true},
{key:'mcap_usd',label:'Market cap',num:true}
];
var title=$('board-h');
var sub=$('board-sub');
var count=$('count');
function boardTitle(){
if(state.tab==='live'){
title.textContent='Live token view: the '+D.live_size+' largest protocols whose token already trades';
sub.textContent='The market\'s own figures, not the model\'s: a trading protocol has a real market cap, so it needs no implied value. Read beside the board, never inside it.';
}else{
title.textContent='Pre-token board: '+D.board_size+' protocols ranked by implied value';
sub.textContent=D.watchlist_size+' on the watchlist ('+money(D.floor_usd)+' TVL and above, no token recorded) plus '+D.early_size+' other protocols the snapshot records no token for, above and below that floor. Bridges, staked and wrapped products are set aside. Click a row for its model breakdown and farm plan.';
}
}
function fillFilters(){
var cat=$('f-category');
var chain=$('f-chain');
var cats={},chs={};
(state.tab==='live'?D.live:D.rows).forEach((r)=>{
cats[r.category||'(none)']=(cats[r.category||'(none)']||0)+1;
(r.chains||[]).forEach((c)=>{chs[c]=(chs[c]||0)+1;});
});
function fill(sel,all,counts){
sel.textContent='';
var o=mk('option',null,all);
o.value='all';
sel.append(o);
Object.keys(counts).sort((a,b)=>{return counts[b]-counts[a]||a.localeCompare(b);}).forEach((c)=>{
var opt=mk('option',null,c+' ('+counts[c]+')');
opt.value=c;
sel.append(opt);
});
}
fill(cat,'All categories',cats);
fill(chain,'All chains',chs);
cat.value=cats[state.category]!==undefined||state.category==='all'?state.category:'all';
chain.value=chs[state.chain]!==undefined||state.chain==='all'?state.chain:'all';
}
function sorter(){
var k=state.sort,d=state.dir;
if(k==='rank'&&state.tab==='live')k='mcap_usd';
return(a,b)=>{
if(k==='rank')return(a.rank-b.rank)*d;
if(k==='name'||k==='category')return String(a[k]||'').localeCompare(String(b[k]||''))*d;
if(k==='chains')return String((a.chains||[])[0]||'').localeCompare(String((b.chains||[])[0]||''))*d;
var av=a[k]===null||a[k]===undefined?-Infinity:a[k];
var bv=b[k]===null||b[k]===undefined?-Infinity:b[k];
return(av-bv)*d;
};
}
function visibleRows(){
var q=state.q.toLowerCase();
var rows=(state.tab==='live'?D.live:D.rows).filter((r)=>{
if(state.tab!=='live'){
if(state.scope==='watchlist'&&!r.on_watchlist)return false;
if(state.scope==='early'&&r.on_watchlist)return false;
}
if(state.category!=='all'&&(r.category||'(none)')!==state.category)return false;
if(state.chain!=='all'&&(r.chains||[]).indexOf(state.chain)<0)return false;
if(!q)return true;
var hay=state.tab==='live'?[r.name,r.category||'']:[r.name,r.slug,r.category||''];
return hay.concat((r.chains||[]).join(' ')).join(' ').toLowerCase().indexOf(q)>=0;
});
return rows.sort(sorter());
}
function renderHead(){
var row=$('head-row');
row.textContent='';
(state.tab==='live'?LIVE_COLS:COLS).forEach((c)=>{
var th=mk('th',c.num?'num':null);
if(state.sort===c.key)th.setAttribute('aria-sort',state.dir===1?'ascending':'descending');
var b=mk('button',null,c.label);
b.type='button';
b.append(mk('span','arrow',state.sort===c.key?(state.dir===1?'▲':'▼'):'▲'));
b.addEventListener('click',()=>{
if(state.sort===c.key)state.dir=-state.dir;
else{state.sort=c.key;state.dir=c.num&&c.key!=='rank'?-1:1;}
if(state.tab==='live'&&state.sort==='rank')state.dir=-1;
render();
});
th.append(b);
row.append(th);
});
var endTh=mk('th','num');
endTh.append(mk('span',null,''));
row.append(endTh);
}
function chips(list,max){
var wrap=mk('div','chips');
list.slice(0,max).forEach((c)=>{wrap.append(mk('span','chip',c));});
if(list.length>max)wrap.append(mk('span','chip more','+'+(list.length-max)));
return wrap;
}
function cell(cls,content){
var td=mk('td',cls);
if(typeof content==='string')td.textContent=content;
else td.append(content);
return td;
}
function rowCells(r,i){
var out=[];
if(state.tab==='live'){
var nm=mk('td','pname',r.name);
nm.append(mk('small',null,r.slug));
out.push(cell('rank',String(i+1)),nm,cell(null,r.category||'(none)'),
cell(null,chips(r.chains||[],2)),cell('num',money(r.tvl_usd)),cell('num',pct(r.change_7d)),
cell('num',mult(r.multiple)),cell('num imp',money(r.mcap_usd)));
return out;
}
var name=mk('td','pname',r.name);
name.append(mk('span','flag'+(r.on_watchlist?'':' early'),r.on_watchlist?'watchlist':'off-watchlist'),
mk('small',null,r.slug));
var open=mk('button','ghost','Details');
open.type='button';
open.addEventListener('click',(ev)=>{ev.stopPropagation();openDetail(r);});
out.push(cell('rank',mk('b',null,String(r.rank))),name,cell(null,r.category||'(none)'),
cell(null,chips(r.chains||[],2)),cell('num',money(r.tvl_usd)),
cell('num '+pctClass(r.change_7d),pct(r.change_7d)),cell('num',age(r.age_days)),
cell('num imp',money(r.implied_value_usd)),cell('num',open));
return out;
}
function renderBody(rows){
var body=$('tbody');
body.textContent='';
$('empty').hidden=rows.length>0;
rows.forEach((r,i)=>{
var tr=mk('tr');
tr.tabIndex=0;
tr.setAttribute('data-slug',r.slug);
tr.setAttribute('data-name',r.name);
rowCells(r,i).forEach((td)=>{tr.append(td);});
tr.addEventListener('click',()=>{state.tab==='live'?openLive(r):openDetail(r);});
tr.addEventListener('keydown',(ev)=>{
if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();state.tab==='live'?openLive(r):openDetail(r);}
});
body.append(tr);
});
}
function render(){
boardTitle();
$('howto').hidden=state.tab==='live';
var rows=visibleRows();
renderHead();
renderBody(rows);
count.textContent=rows.length+(state.tab==='live'?' live protocols':' ranked rows of '+D.rows.length)+
' · sorted by '+(state.sort==='rank'?'rank':state.sort.replace('_usd','').replace('_',' '))+
(state.dir===1?' ascending':' descending');
}
var detail=$('detail');
var scrim=$('scrim');
var dbody=$('detail-body');
var crumb=$('detail-crumb');
function kv(parent,pairs){
var grid=mk('div','kv');
pairs.forEach((p)=>{
var d=mk('div');
d.append(mk('dt',null,p[0]),mk('dd',null,p[1]));
grid.append(d);
});
parent.append(grid);
}
function section(parent,heading){
var s=mk('div','dsec');
s.append(mk('h3',null,heading));
parent.append(s);
return s;
}
function calcRow(cls,label,value,op){
var d=mk('div','calc'+(cls?' '+cls:''));
d.append(mk('span',null,label),mk('span','v',value),mk('span','op',op));
return d;
}
function openDetail(r){
crumb.textContent='row '+r.rank+' of '+D.board_size+' · '+r.slug;
dbody.textContent='';
var head=mk('h2',null,r.name);
head.id='detail-name';
dbody.append(head);
dbody.append(mk('p','sub',(r.category||'(no category)')+' · ranked '+r.rank+' · '+(r.on_watchlist?'on the watchlist':'ranked outside the watchlist')));
var calc=recompute(r);
var m=D.model;
var mb=section(dbody,'Model breakdown');
var wrap=mk('div','brkdn');
wrap.append(calcRow('head','Implied FDV for this protocol',money(r.implied_value_usd),
'what the snapshot’s own live-token protocols imply this protocol is worth at launch'));
var cat=cmpByCategory[r.category||'(none)'];
[
['TVL, from the snapshot',money(r.tvl_usd),'total value locked'],
['× base multiple',mult(r.model.base_multiple),r.model.multiple_source==='category'
?'category median: '+r.model.comparables+' live-token '+(r.category||'uncategorised')+' peers'
:'global median: this category carries '+r.model.comparables+' live-token peer'+(r.model.comparables===1?'':'s')+', under the '+m.min_comparables+' needed'],
['× growth multiplier',mult(calc.growthMult),
'from a 7-day TVL change of '+pct(r.change_7d)+', clamped to ['+m.growth_floor+'%, +'+m.growth_cap+'%] and scaled by '+m.growth_weight],
['× maturity multiplier',mult(calc.maturity),r.age_days===null
?'no listed_at recorded, so the neutral '+m.neutral_maturity+' applies'
:'from '+r.age_days+' days since listing ('+age(r.age_days)+'), rising toward '+(m.maturity_floor+m.maturity_range).toFixed(2)+' at '+m.maturity_days+' days']
].forEach((p)=>{wrap.append(calcRow(null,p[0],p[1],p[2]));});
wrap.append(calcRow('total','= implied FDV',money(r.implied_value_usd),
money(r.tvl_usd)+' × '+r.model.factors[0].toFixed(4)+' × '+r.model.factors[1].toFixed(4)+' × '+r.model.factors[2].toFixed(4)+' = '+money(calc.implied)));
mb.append(wrap);
mb.append(mk('p','sub check',calc.agrees
?'The page recomputes this from the snapshot figures and gets the board’s number exactly.'
:'The page recomputed '+money(calc.implied)+' from these figures; the board carries '+money(r.implied_value_usd)+'.'));
var fs=section(dbody,'Farm plan: what to do, what it costs, how long');
var ol=mk('ol','steps');
(r.farm_steps||[]).forEach((s)=>{
var li=mk('li');
var div=mk('div');
var m2=/^(.*?)\sCost:\s(.*?)\.\sTime:\s(.*?)\.$/.exec(s);
if(m2)div.append(m2[1],mk('span','ct','Cost: '+m2[2]+' · Time: '+m2[3]));
else div.append(s);
li.append(div);
ol.append(li);
});
fs.append(ol);
var cs=section(dbody,'Comparables behind this multiple');
cs.append(mk('p','sub',cat===undefined
?'This category carries no live-token protocol, so the global median across '+D.global_comparables+' live protocols is used: '+mult(D.global_multiple)+'.'
:cat.source==='category'
?'The median of '+cat.comparables+' live-token '+cat.category+' protocols is '+mult(cat.multiple)+'. The names nearest that median; their median mcap/TVL prices this protocol’s TVL.'
:cat.category+' carries only '+cat.comparables+' live-token protocol'+(cat.comparables===1?'':'s')+', under the '+D.model.min_comparables+' needed, so the global median '+mult(D.global_multiple)+' across '+D.global_comparables+' live protocols is used. The category’s own live names:'));
if(cat!==undefined&&cat.examples.length>0){
var list=mk('div','clist');
cat.examples.forEach((e)=>{
var d=mk('div');
d.append(mk('span',null,e.name+' '+money(e.tvl_usd)+' TVL'),mk('span',null,money(e.mcap_usd)+' · '+mult(e.multiple)));
list.append(d);
});
cs.append(list);
}
var sf=section(dbody,'Snapshot record');
kv(sf,[
['slug',r.slug],
['category',r.category||'(none)'],
['chains',(r.chains||[]).length?(r.chains||[]).join(', '):'(none)'],
['tvl_usd',money(r.tvl_usd)],
['change_7d',pct(r.change_7d)],
['listed_at',r.listed_at===null?'none recorded':r.listed_at],
['age_days',r.age_days===null?'unknown':String(r.age_days)],
['mcap_usd',r.mcap_usd===null?'none recorded':money(r.mcap_usd)],
['gecko_id',r.gecko_id===null?'none recorded':r.gecko_id],
['symbol',r.symbol===null?'none recorded':r.symbol]
]);
sf.append(mk('p','caveat',
'This row says the snapshot records no token for '+r.name+'; it does not say the protocol has none. '+
'The snapshot is DefiLlama\'s record as of '+D.as_of+', and every number above is read from it, not live.'));
scrim.hidden=false;
detail.hidden=false;
$('detail-close').focus();
}
function openLive(r){
crumb.textContent='live token · '+r.slug;
dbody.textContent='';
var head=mk('h2',null,r.name);
head.id='detail-name';
dbody.append(head);
dbody.append(mk('p','sub',(r.category||'(no category)')+' · token already trades · market cap '+money(r.mcap_usd)));
var sf=section(dbody,'Market record');
kv(sf,[
['slug',r.slug],
['chains',(r.chains||[]).join(', ')||'(none)'],
['tvl_usd',money(r.tvl_usd)],
['mcap_usd',money(r.mcap_usd)],
['mcap / TVL',mult(r.multiple)],
['change_7d',pct(r.change_7d)]
]);
sf.append(mk('p','caveat',
'A protocol whose token trades is priced by its market, not the model: it sits in the live view, never the board. '+
'Its multiple is the snapshot\'s market cap over its TVL, a comparable the board uses.'));
scrim.hidden=false;
detail.hidden=false;
$('detail-close').focus();
}
function closeDetail(){
detail.hidden=true;
scrim.hidden=true;
}
$('detail-close').addEventListener('click',closeDetail);
scrim.addEventListener('click',closeDetail);
document.addEventListener('keydown',(ev)=>{if(ev.key==='Escape'&&!detail.hidden)closeDetail();});
function setTab(tab){
state.tab=tab;
state.sort='rank';
state.dir=1;
state.category='all';
state.chain='all';
state.scope='all';
document.querySelectorAll('.tab').forEach((b)=>{
var on=b.getAttribute('data-tab')===tab;
b.classList.toggle('is-on',on);
b.setAttribute('aria-selected',on?'true':'false');
});
fillFilters();
render();
}
document.querySelectorAll('.tab').forEach((b)=>{
b.addEventListener('click',()=>{setTab(b.getAttribute('data-tab'));});
});
document.querySelectorAll('#f-scope button').forEach((b)=>{
b.addEventListener('click',()=>{
state.scope=b.getAttribute('data-scope');
document.querySelectorAll('#f-scope button').forEach((o)=>{o.classList.toggle('is-on',o===b);});
render();
});
});
$('q').addEventListener('input',(e)=>{state.q=e.target.value.trim();render();});
$('f-category').addEventListener('change',(e)=>{state.category=e.target.value;render();});
$('f-chain').addEventListener('change',(e)=>{state.chain=e.target.value;render();});
$('reset').addEventListener('click',()=>{
state.q='';
state.category='all';
state.chain='all';
state.scope='all';
state.sort='rank';
state.dir=1;
$('q').value='';
$('reset').blur();
document.querySelectorAll('#f-scope button').forEach((o)=>{o.classList.toggle('is-on',o.getAttribute('data-scope')==='all');});
fillFilters();
render();
});
$('foot-source').textContent='Snapshot: '+D.source+' · as_of '+D.as_of+' · '+D.watchlist_size+
' watchlist protocols, '+D.board_size+' ranked rows, '+D.global_comparables+' live-token comparables.';
fillFilters();
render();
})();
