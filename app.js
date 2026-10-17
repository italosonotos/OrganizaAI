// ====== CONFIGURE AQUI (Supabase > Project Settings > API) ======
const SUPABASE_URL = 'https://brrmtnnxzjthsfzwygew.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wj_-RAvaik7hLao-Vp3E5w_o2kyGKn_';
// ================================================================
const showMsg = m => { const el=document.getElementById('loginMsg'); if(el) el.textContent=m; };
window.addEventListener('error', e => showMsg('Erro: '+e.message));
window.addEventListener('unhandledrejection', e => showMsg('Erro: '+(e.reason&&e.reason.message||e.reason)));
let db = null;
if(typeof supabase === 'undefined') showMsg('A biblioteca do Supabase não carregou. Verifique a internet.');
else if(SUPABASE_URL.includes('COLE_') || SUPABASE_KEY.includes('COLE_')) showMsg('Falta colar a URL e a chave do Supabase no topo do app.js.');
else { try { db = supabase.createClient(SUPABASE_URL.trim(), SUPABASE_KEY.trim()); } catch(e) { showMsg('URL ou chave inválida: '+e.message); } }
const CATS = ['Moradia','Alimentação','Transporte','Saúde','Lazer','Compras','Contas','Outros'];
const TIPOS = {entrada:'Entrada', debito:'Débito', credito:'Crédito', dinheiro:'Dinheiro'};
const $ = s => document.querySelector(s);
const R = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sum = (a,f) => a.reduce((t,x)=>t+Number(f(x)||0),0);
const today = () => new Date().toISOString().slice(0,10);
const addM = (ym,n) => { const [y,m]=ym.split('-').map(Number); const d=new Date(y,m-1+n,1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); };
const mLabel = ym => { const [y,m]=ym.split('-'); return new Date(y,m-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}); };

let S = {tx:[],accounts:[],cards:[],incomes:[],debts:[],bills:[],payments:[]};
let month = today().slice(0,7), view = 'geral', q = '', ftype = '';
const TITLES = {geral:'Visão geral',contas:'Minhas contas',dividas:'Contas e dívidas',perfil:'Perfil e rendas fixas'};

// ---------- campos das entidades (tudo editável no site) ----------
const num = (k,l,extra={}) => ({k,l,t:'number',step:'0.01',...extra});
const ENT = {
  bills:{nome:'conta',f:[{k:'group_name',l:'Categoria (ex: Contas da casa)'},{k:'name',l:'Descrição (ex: Energia)'},num('amount','Valor padrão (R$)'),num('due_day','Dia de vencimento',{step:'1'})]},
  accounts:{nome:'conta',f:[{k:'name',l:'Nome (ex: Bradesco, Dinheiro físico)'},num('balance','Saldo inicial (R$)')]},
  cards:{nome:'cartão',f:[{k:'name',l:'Nome do cartão (ex: Picpay)'},{k:'bank',l:'Banco'},num('credit_limit','Limite (R$)'),
    num('closing_day','Dia de fechamento',{step:'1'}),num('due_day','Dia de vencimento',{step:'1'})]},
  incomes:{nome:'renda fixa',f:[{k:'name',l:'Nome (ex: Salário Italo)'},num('amount','Valor mensal (R$)')]},
  debts:{nome:'empréstimo/dívida',f:[{k:'name',l:'Nome (ex: Crediário, Moto)'},{k:'bank',l:'Banco'},num('installment','Valor da parcela (R$)'),
    num('installments_total','Total de parcelas',{step:'1'}),num('installments_paid','Parcelas já pagas',{step:'1'}),num('due_day','Dia de vencimento',{step:'1'})]}
};

// ---------- login ----------
async function auth(criar){
  if(!db) return showMsg('Supabase não configurado (veja o topo do app.js).');
  const email=$('#email').value.trim(), password=$('#senha').value;
  if(!email || password.length<6) return showMsg('Preencha o e-mail e uma senha com pelo menos 6 caracteres.');
  const {error} = criar ? await db.auth.signUp({email,password}) : await db.auth.signInWithPassword({email,password});
  $('#loginMsg').textContent = error ? error.message : (criar?'Conta criada. Confirme o e-mail se o Supabase pedir e entre.':'');
  if(!error && !criar) start();
}
$('#btnEntrar').onclick = () => auth(false);
$('#btnCriar').onclick = () => auth(true);

async function start(){
  if(!db) return;
  const {data:{session}} = await db.auth.getSession();
  $('#login').classList.toggle('hidden',!!session);
  $('#app').classList.toggle('hidden',!session);
  if(session){ await load(); render(); }
}
async function load(){
  const T=['transactions','accounts','cards','incomes','debts','bills','payments'];
  const r=await Promise.all(T.map(t=>db.from(t).select('*')));
  const g=i=>r[i].data||[];
  S={tx:g(0).sort((a,b)=>b.date.localeCompare(a.date)),accounts:g(1),cards:g(2),incomes:g(3),debts:g(4),bills:g(5),payments:g(6)};
  if(r[5].error||r[6].error) alert('Faltam as tabelas novas. Rode o arquivo migracao2.sql no Supabase.');
}

// ---------- cálculos ----------
const inMonth = t => t.ref_month.slice(0,7) === month;
const paidThisMonth = d => !!d.paid_month && d.paid_month.slice(0,7) === month;
const debtsInMonth = () => S.debts.filter(d => {
  if(paidThisMonth(d)) return true;
  const rem = d.installments_total - d.installments_paid; if(rem<=0) return false;
  const start = d.paid_month ? addM(d.paid_month.slice(0,7),1) : today().slice(0,7);
  return month >= start && month < addM(start,rem);
});
const billsInMonth = () => S.bills.filter(b => b.created_at.slice(0,7) <= month);
const payOf = (kind,id) => S.payments.find(p => p.kind===kind && p.ref_id===id && p.month.slice(0,7)===month);
const billAmount = b => { const p=payOf('bill',b.id); return Number(p?p.amount:b.amount); };
const accBalance = a => Number(a.balance) + sum(S.tx.filter(t=>t.account_id===a.id),t=>t.type==='entrada'?t.amount:(t.type==='credito'?0:-t.amount));
const cardInvoice = c => sum(S.tx.filter(t=>t.card_id===c.id&&inMonth(t)),t=>t.amount);

// ---------- formulário genérico (modal) ----------
function openForm({title,fields,values={},onSave,onDelete}){
  const f = $('#form');
  f.innerHTML = `<div class="row"><strong>${title}</strong><button type="button" class="icon" id="x">✕</button></div>` +
    fields.map(x=>`<div data-k="${x.k}"><label>${x.l}</label>${
      x.opts ? `<select id="f_${x.k}">${x.opts.map(o=>`<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select>`
             : `<input id="f_${x.k}" type="${x.t||'text'}" ${x.step?`step="${x.step}"`:''} inputmode="${x.t==='number'?'decimal':'text'}" ${x.list?`list="dl_${x.k}"`:''}>${x.list?`<datalist id="dl_${x.k}">${x.list.map(o=>`<option value="${esc(o)}">`).join('')}</datalist>`:''}`}</div>`).join('') +
    `<button class="btn" type="submit">Salvar</button>` + (onDelete?`<button class="btn del" type="button" id="del">Excluir</button>`:'');
  fields.forEach(x => { const el=$('#f_'+x.k); if(values[x.k]!==undefined && values[x.k]!==null) el.value=values[x.k]; });
  const get = () => Object.fromEntries(fields.map(x=>[x.k,$('#f_'+x.k).value]));
  const vis = () => { const v=get(); fields.forEach(x=>{ if(x.show) f.querySelector(`[data-k="${x.k}"]`).classList.toggle('hidden',!x.show(v)); }); };
  f.oninput = vis; f.onchange = vis; vis();
  const close = () => $('#modal').classList.add('hidden');
  $('#x').onclick = close;
  f.onsubmit = async e => { e.preventDefault(); const v=get(); fields.forEach(x=>{ if(x.show&&!x.show(v)) delete v[x.k]; }); await onSave(v); close(); await load(); render(); };
  if(onDelete) $('#del').onclick = async()=>{ if(confirm('Excluir?')){ await onDelete(); close(); await load(); render(); } };
  $('#modal').classList.remove('hidden');
}

// ---------- CRUD genérico ----------
function editEnt(table,id,preset={}){
  const e=ENT[table], row=id?S[table].find(r=>r.id===id):preset;
  let fields=e.f;
  if(table==='bills') fields=fields.map(x=>x.k==='group_name'?{...x,list:[...new Set(['Contas da casa',...S.bills.map(b=>b.group_name)])]}:x);
  openForm({title:(id?'Editar ':'Nova ')+e.nome,fields,values:row,
    onSave: async v => { fields.forEach(x=>{ if(x.t==='number') v[x.k]=Number(v[x.k]||0); });
      const r=id?await db.from(table).update(v).eq('id',id):await db.from(table).insert(v); if(r.error) return alert(r.error.message);
      if(table==='bills'&&!id) setTimeout(()=>{ if(confirm('Adicionar outra conta em "'+v.group_name+'"?')) editEnt('bills',null,{group_name:v.group_name,due_day:v.due_day}); },400); },
    onDelete: id ? async()=>{ if(table==='bills') await db.from('payments').delete().eq('ref_id',id); await db.from(table).delete().eq('id',id); } : null});
}

// ---------- lançamentos ----------
function editTx(id){
  const t = id ? S.tx.find(x=>x.id===id) : {type:'debito',date:today()};
  const accOpts = [['','— nenhuma —'],...S.accounts.map(a=>[a.id,a.name])];
  const cardOpts = S.cards.map(c=>[c.id,c.name+' ('+c.bank+')']);
  const parc = Array.from({length:24},(_,i)=>[i+1,i?`${i+1}x`:'1x à vista']);
  const fields = [
    {k:'type',l:'Tipo',opts:Object.entries(TIPOS)},
    num('amount','Valor (R$)'),
    {k:'description',l:'Descrição'},
    {k:'category',l:'Categoria',opts:CATS.map(c=>[c,c])},
    {k:'date',l:'Data',t:'date'},
    {k:'account_id',l:'Conta / banco',opts:accOpts,show:v=>v.type!=='credito'},
    {k:'card_id',l:'Cartão de crédito',opts:cardOpts,show:v=>v.type==='credito'},
    {k:'parcelas',l:'Parcelas',opts:parc,show:v=>v.type==='credito'&&!id}
  ];
  openForm({title:id?'Editar lançamento':'Novo lançamento',fields,values:t,
    onSave: async v => {
      const base = {type:v.type,category:v.category,description:v.description,date:v.date,
        account_id:v.account_id||null,card_id:v.type==='credito'?v.card_id||null:null};
      const total = Number(v.amount);
      if(id){ // edição: só altera esta linha
        const ref = (v.type==='credito'&&id) ? t.ref_month : v.date.slice(0,7)+'-01';
        const r=await db.from('transactions').update({...base,amount:total,ref_month:ref}).eq('id',id); if(r.error) alert(r.error.message); return; }
      const n = v.type==='credito' ? Number(v.parcelas||1) : 1;
      let first = v.date.slice(0,7);
      if(v.type==='credito'){ const c=S.cards.find(c=>c.id===v.card_id); if(c && Number(v.date.slice(8,10))>c.closing_day) first=addM(first,1); }
      const gid = crypto.randomUUID(), each = Math.floor(total/n*100)/100, rows=[];
      for(let i=0;i<n;i++) rows.push({...base,amount:i===n-1?+(total-each*(n-1)).toFixed(2):each,
        ref_month:addM(first,i)+'-01',installment_no:i+1,installment_total:n,group_id:gid});
      const r=await db.from('transactions').insert(rows); if(r.error) alert(r.error.message);
    },
    onDelete: id ? async()=>{
      if(t.group_id && t.installment_total>1 && confirm('Excluir todas as parcelas desta compra? (Cancelar = só esta)'))
        await db.from('transactions').delete().eq('group_id',t.group_id);
      else await db.from('transactions').delete().eq('id',id);
    } : null});
}

// ---------- telas ----------
function vGeral(){
  const mt = S.tx.filter(inMonth), fixas = sum(S.incomes,i=>i.amount), dv = sum(debtsInMonth(),d=>d.installment) + sum(billsInMonth(),billAmount);
  const ent = sum(mt.filter(t=>t.type==='entrada'),t=>t.amount)+fixas;
  const sai = sum(mt.filter(t=>t.type!=='entrada'),t=>t.amount)+dv;
  const saldo = sum(S.accounts,accBalance);
  const lista = mt.filter(t=>(!ftype||t.type===ftype)&&(`${t.description} ${t.category}`.toLowerCase().includes(q.toLowerCase())));
  return `<div class="months"><button data-m="-1">‹</button><strong style="text-transform:capitalize">${mLabel(month)}</strong><button data-m="1">›</button></div>
  <div class="card"><span class="muted">Saldo nas contas</span><div class="big">${R(saldo)}</div></div>
  <div class="grid">
    <div class="card"><span class="muted">Entradas</span><div class="big pos" style="font-size:20px">${R(ent)}</div></div>
    <div class="card"><span class="muted">Saídas</span><div class="big neg" style="font-size:20px">${R(sai)}</div></div></div>
  <div class="card row"><span>${ent-sai>=0?'Sobra do mês':'Falta no mês'}</span><strong class="${ent-sai>=0?'pos':'neg'}">${R(ent-sai)}</strong></div>
  <h3>Status do mês</h3>${groups(false)}
  <h3>Total por banco (fatura + empréstimos)</h3>${bankCards()}
  <h3>Lançamentos</h3>
  <div class="grid"><input id="q" placeholder="Buscar..." value="${esc(q)}">
  <select id="ft"><option value="">Todos</option>${Object.entries(TIPOS).map(([k,v])=>`<option value="${k}" ${ftype===k?'selected':''}>${v}</option>`).join('')}</select></div>
  <div class="card" style="margin-top:12px">${lista.map(t=>`<div class="item row" data-tx="${t.id}"><div>${esc(t.description||t.category)}<div class="muted">${t.date.split('-').reverse().slice(0,2).join('/')} · ${esc(t.category||'')} · ${TIPOS[t.type]}${t.installment_total>1?` ${t.installment_no}/${t.installment_total}`:''}</div></div>
    <strong class="${t.type==='entrada'?'pos':'neg'}">${t.type==='entrada'?'+':'-'}${R(t.amount)}</strong></div>`).join('')||'<span class="muted">Nada neste mês. Toque em + para lançar.</span>'}</div>`;
}
function bankTotals(){
  const b = {};
  S.cards.forEach(c=>{ const k=c.bank; b[k]=b[k]||{fat:0,emp:0}; b[k].fat+=cardInvoice(c); });
  debtsInMonth().forEach(d=>{ b[d.bank]=b[d.bank]||{fat:0,emp:0}; b[d.bank].emp+=Number(d.installment); });
  return b;
}
function bankCards(){
  const b=bankTotals();
  return Object.entries(b).map(([k,v])=>`<div class="card"><div class="row"><strong>${esc(k)}</strong><strong class="neg">${R(v.fat+v.emp)}</strong></div>
    <div class="muted">Fatura ${R(v.fat)} + empréstimos ${R(v.emp)}</div></div>`).join('')||'<span class="muted">Cadastre cartões e dívidas para ver o total por banco.</span>';
}
function vContas(){
  return `<div class="card">${S.accounts.map(a=>`<div class="item row" data-ent="accounts:${a.id}"><span>${esc(a.name)}</span><strong>${R(accBalance(a))}</strong></div>`).join('')||'<span class="muted">Nenhuma conta ainda.</span>'}</div>
  <button class="btn" data-new="accounts">Nova conta</button>`;
}
const ICON={ok:'✓',late:'!',no:'✕'}, ORDER={late:0,no:1,ok:2}, ENTMAP={bill:'bills',debt:'debts',card:'cards'};
const lateOrNo = due => { const cur=today().slice(0,7), day=Number(today().slice(8,10));
  return (month<cur || (month===cur && day>(due||31))) ? {k:'late',t:'Atrasada'} : {k:'no',t:'Não paga'}; };
function items(){
  const out=[];
  billsInMonth().forEach(b=>out.push({kind:'bill',id:b.id,group:b.group_name,name:b.name,amount:billAmount(b),paid:!!payOf('bill',b.id),due:b.due_day}));
  debtsInMonth().forEach(d=>out.push({kind:'debt',id:d.id,group:'Empréstimos',name:d.name,amount:Number(d.installment),paid:paidThisMonth(d),due:d.due_day,
    parc:d.installments_total>1?`${d.installments_paid}/${d.installments_total} parcelas pagas`:''}));
  S.cards.forEach(c=>{ const inv=cardInvoice(c), paid=!!payOf('card',c.id); if(inv>0||paid) out.push({kind:'card',id:c.id,group:'Cartões',name:c.name,amount:inv,paid,due:c.due_day}); });
  out.forEach(i=>{ i.st = i.paid ? {k:'ok',t:'Paga'} : lateOrNo(i.due); });
  return out;
}
const box = (i,edit) => `<div class="box ${i.st.k}"><div ${edit?`data-ent="${ENTMAP[i.kind]}:${i.id}"`:''}>
  <div class="row top"><strong>${esc(i.name)}</strong><span class="dot">${ICON[i.st.k]}</span></div>
  <div class="st">${i.st.t}</div><div class="muted">${i.parc||'&nbsp;'}</div></div>
  <button class="btn sm ghost" data-pay="${i.kind}:${i.id}">${i.paid?'Desfazer':'Marcar como paga'}</button></div>`;
function groups(edit){
  const g={}; items().forEach(i=>(g[i.group]=g[i.group]||[]).push(i));
  const rank=n=>({'Empréstimos':1,'Cartões':2}[n]||0);
  const html=Object.keys(g).sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b)).map(n=>{
    const a=g[n].sort((x,y)=>ORDER[x.st.k]-ORDER[y.st.k]||x.name.localeCompare(y.name));
    return `<div class="grp"><div class="row"><strong>${esc(n)}</strong><span class="muted">${a.filter(i=>i.paid).length}/${a.length} pagas · ${R(sum(a,i=>i.amount))}</span></div>
      <div class="boxes">${a.map(i=>box(i,edit)).join('')}</div></div>`; }).join('');
  return html || '<span class="muted">Nenhuma conta neste mês. Cadastre em "Contas e dívidas".</span>';
}
async function togglePay(key){
  const [kind,id]=key.split(':'), mref=month+'-01';
  const done = async r => { if(r&&r.error) alert(r.error.message); await load(); render(); };
  if(kind==='debt'){ const d=S.debts.find(x=>x.id===id);
    return done(await db.from('debts').update(paidThisMonth(d)?{installments_paid:Math.max(0,d.installments_paid-1),paid_month:null}:{installments_paid:d.installments_paid+1,paid_month:mref}).eq('id',id)); }
  const p=payOf(kind,id);
  if(p) return done(await db.from('payments').delete().eq('id',p.id));
  if(kind==='card') return done(await db.from('payments').insert({kind,ref_id:id,month:mref,amount:cardInvoice(S.cards.find(x=>x.id===id))}));
  const b=S.bills.find(x=>x.id===id);
  openForm({title:'Pagar '+b.name,fields:[num('amount','Valor pago neste mês (R$)')],values:{amount:billAmount(b)},
    onSave: async v => { const r=await db.from('payments').insert({kind,ref_id:id,month:mref,amount:Number(v.amount)}); if(r.error) alert(r.error.message); }});
}
function vDividas(){
  return `<div class="months"><button data-m="-1">‹</button><strong style="text-transform:capitalize">${mLabel(month)}</strong><button data-m="1">›</button></div>
  <div class="three"><button class="btn" data-new="bills">+ Nova conta</button><button class="btn ghost" data-new="debts">+ Nova dívida</button><button class="btn ghost" data-new="cards">+ Novo cartão</button></div>
  <h3>Status do mês (toque num quadrado para editar)</h3>${groups(true)}
  <h3>Total por banco</h3>${bankCards()}
  <h3>Limite dos cartões</h3>
  ${S.cards.map(c=>{ const usado=sum(S.tx.filter(t=>t.card_id===c.id&&t.ref_month.slice(0,7)>=month),t=>t.amount), p=Math.min(100,usado/(c.credit_limit||1)*100);
    return `<div class="card" data-ent="cards:${c.id}"><div class="row"><strong>${esc(c.name)}</strong><strong class="neg">${R(cardInvoice(c))}</strong></div>
    <div class="muted">${esc(c.bank)} · fecha dia ${c.closing_day} · vence dia ${c.due_day}</div>
    <div class="bar"><i style="width:${p}%"></i></div><div class="muted">Limite comprometido ${R(usado)} de ${R(c.credit_limit)}</div></div>`;}).join('')}`;
}
function vPerfil(){
  return `<h3>Rendas fixas (somam todo mês)</h3><div class="card">${S.incomes.map(i=>`<div class="item row" data-ent="incomes:${i.id}"><span>${esc(i.name)}</span><strong class="pos">${R(i.amount)}</strong></div>`).join('')||'<span class="muted">Nenhuma renda fixa.</span>'}
  <div class="row item"><span>Total</span><strong>${R(sum(S.incomes,i=>i.amount))}</strong></div></div>
  <button class="btn" data-new="incomes">Nova renda fixa</button><button class="btn ghost" id="sair">Sair</button>`;
}
function render(){
  $('#titulo').textContent = TITLES[view];
  $('#main').innerHTML = {geral:vGeral,contas:vContas,dividas:vDividas,perfil:vPerfil}[view]();
  document.querySelectorAll('#drawer a').forEach(a=>a.classList.toggle('on',a.dataset.view===view));
}

// ---------- eventos ----------
const drawer = open => { $('#drawer').classList.toggle('open',open); $('#scrim').classList.toggle('open',open); };
$('#btnMenu').onclick = () => drawer(true);
$('#scrim').onclick = () => drawer(false);
$('#fab').onclick = () => editTx();
document.querySelectorAll('#drawer a').forEach(a=>a.onclick=()=>{ view=a.dataset.view; drawer(false); render(); });
$('#main').addEventListener('click', async e => {
  const el = e.target.closest('[data-m],[data-tx],[data-ent],[data-new],[data-pay],#sair'); if(!el) return;
  if(el.dataset.m){ month=addM(month,Number(el.dataset.m)); render(); }
  else if(el.dataset.tx) editTx(el.dataset.tx);
  else if(el.dataset.ent){ const [t,id]=el.dataset.ent.split(':'); editEnt(t,id); }
  else if(el.dataset.new) editEnt(el.dataset.new);
  else if(el.dataset.pay) await togglePay(el.dataset.pay);
  else if(el.id==='sair'){ await db.auth.signOut(); start(); }
});
$('#main').addEventListener('input', e => { if(e.target.id==='q'){ q=e.target.value; const p=e.target.selectionStart; render(); const n=$('#q'); n.focus(); n.setSelectionRange(p,p);} });
$('#main').addEventListener('change', e => { if(e.target.id==='ft'){ ftype=e.target.value; render(); } });
start();
