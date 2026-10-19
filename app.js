/* Shared helpers for the dashboard, booking and history pages. Load after auth.js. */
var me=AS.session();
var STATUS=['Pending','Confirmed','Completed','Cancelled'];
var PESO='\u20B1';
var dlg=document.getElementById('dlg');
function h(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function html(tag,cls,inner){var e=h(tag,cls);e.innerHTML=inner;return e}
function money(n){return PESO+Number(n).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtDate(d){return d?new Date(d+'T00:00').toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}):''}
function bookings(){return AS.get('as_bookings',[]).slice().sort(function(a,b){return b.created-a.created})}
function mine(email){return bookings().filter(function(b){return (b.owner||'').toLowerCase()===email||(b.email||'').toLowerCase()===email})}
function badge(s){return h('span','badge b-'+s.toLowerCase(),s)}
function table(heads,rows){
 var w=h('div','tablewrap'),t=h('table'),th=h('thead'),tr=h('tr');
 heads.forEach(function(x){tr.appendChild(h('th','',x))});th.appendChild(tr);t.appendChild(th);
 var tb=h('tbody');
 rows.forEach(function(r){var tr=h('tr');r.forEach(function(c){var td=h('td');if(c&&c.nodeType)td.appendChild(c);else td.textContent=c==null?'':c;tr.appendChild(td)});tb.appendChild(tr)});
 t.appendChild(tb);w.appendChild(t);return w;
}
function stat(label,value){var c=h('div','stat');c.appendChild(h('strong','',String(value)));c.appendChild(h('small','',label));return c}
function btn(text,cls,fn){var b=h('button','btn sm '+cls,text);b.type='button';b.addEventListener('click',fn);return b}
function empty(msg){return h('p','empty',msg)}
function ckey(k){return 'as_'+k+'_'+me.email}
function getCart(){return AS.get(ckey('cart'),[])}
function setCart(c){AS.set(ckey('cart'),c)}
function getCar(){return AS.get(ckey('car'),null)}
function carText(c){return c?[c.year,c.make,c.model].filter(Boolean).join(' '):''}

function openDlg(title,note,build,actions){
 document.getElementById('dlgTitle').textContent=title;document.getElementById('dlgNote').textContent=note||'';
 var body=document.getElementById('dlgBody');body.textContent='';build(body);
 var a=document.getElementById('dlgActs');a.textContent='';
 actions.forEach(function(x){var b=btn(x[0],x[1],x[2]);b.classList.remove('sm');a.appendChild(b)});
 if(!dlg.open)dlg.showModal();
}
function field(form,name,ph,type,val){var i=h('input');i.name=name;i.placeholder=ph;i.setAttribute('aria-label',ph);if(type)i.type=type;if(val)i.value=val;form.appendChild(i);return i}
function details(b){
 var rows=[['Reference',b.ref],['Status',b.status],['Service',b.service],['Other service needed',b.other],['Total',b.total?money(b.total):''],['Date',fmtDate(b.date)],['Time',b.time],['Name',b.name],['Mobile number',b.mobile],['Email',b.email],['Address',b.address],['Vehicle',b.vehicle],['Issue',b.issue]].filter(function(r){return r[1]});
 openDlg('Booking details','',function(body){var dl=h('dl');rows.forEach(function(r){dl.appendChild(h('dt','',r[0]));dl.appendChild(h('dd','',r[1]))});body.appendChild(dl)},
  [['Print','',function(){window.print()}],['Close','ghost',function(){dlg.close()}]]);
}
function viewBtn(b){return btn('View','ghost',function(){details(b)})}
function vehicleDialog(done){
 var car=getCar()||{},F;
 openDlg('Your vehicle','We use this to prepare the right service for your car.',function(body){
  F=h('form','form');F.noValidate=true;
  var r=h('div','row2');F.appendChild(r);
  field(r,'make','Car make','',car.make);field(r,'model','Car model','',car.model);
  var r2=h('div','row2');F.appendChild(r2);
  var y=field(r2,'year','Car year','',car.year);y.inputMode='numeric';
  var fs=h('select');fs.name='fuel';fs.setAttribute('aria-label','Fuel type');['Gas','Diesel','Hybrid','Electric'].forEach(function(x){var o=h('option','',x);o.value=x;fs.appendChild(o)});fs.value=car.fuel||'Gas';r2.appendChild(fs);
  var er=h('p','err','');er.hidden=true;F.appendChild(er);
  body.appendChild(F);F.addEventListener('submit',function(e){e.preventDefault()});
 },[['Save','',function(){
  var e=F.elements;if(!e.make.value.trim()||!e.model.value.trim()){var er=F.querySelector('.err');er.textContent='Enter your car make and model.';er.hidden=false;return}
  var yr=e.year.value.trim();if(yr&&!/^(19|20)\d{2}$/.test(yr)){var er2=F.querySelector('.err');er2.textContent='Enter a valid 4-digit car year, for example 2018.';er2.hidden=false;return}
  AS.set(ckey('car'),{make:e.make.value.trim(),model:e.model.value.trim(),year:yr,fuel:e.fuel.value});
  dlg.close();done&&done();toast('Vehicle saved','ok');
 }],['Cancel','ghost',function(){dlg.close()}]]);
}
/* Redirects when not signed in (or wrong role). Returns true when the page may continue. */
function guard(role){
 if(!me){location.replace('login.html?next='+encodeURIComponent(location.pathname.split('/').pop()||'dashboard.html'));return false}
 if(role&&me.role!==role){location.replace('dashboard.html');return false}
 return true;
}
function wireNav(){
 document.querySelectorAll('nav [data-cust]').forEach(function(a){if(me&&me.role!=='customer')a.hidden=true});
 document.querySelectorAll('nav [data-admin]').forEach(function(a){if(me&&me.role!=='admin')a.hidden=true});
 var cur=location.pathname.split('/').pop()||'dashboard.html';
 document.querySelectorAll('.dnav a[href]').forEach(function(a){if(a.getAttribute('href')===cur)a.classList.add('on')});
 var lo=document.getElementById('logoutLink');
 if(lo)lo.addEventListener('click',function(e){e.preventDefault();AS.logout();location.replace('login.html')});
}

/* ---- dates and upcoming appointments ---- */
function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function tmin(t){var m=/(\d+):(\d+)\s*(AM|PM)/i.exec(t||'');if(!m)return 0;return ((+m[1]%12)+(/pm/i.test(m[3])?12:0))*60+(+m[2])}
function upcomingList(list){var t=today();return list.filter(function(b){return (b.status==='Pending'||b.status==='Confirmed')&&b.date>=t}).sort(function(a,b){return a.date===b.date?tmin(a.time)-tmin(b.time):(a.date<b.date?-1:1)})}
function upcoming(list){return upcomingList(list)[0]}
function sectionHead(title,linkText,href){var r=h('div','ov-head');r.appendChild(h('h2','',title));if(linkText){var l=h('a','textlink2',linkText);l.href=href;r.appendChild(l)}return r}

/* ---- admin helpers ---- */
function customersList(){return AS.users().filter(function(u){return u.role==='customer'})}
/* ---- shared UX helpers ---- */
var SLOT_CAP=3; /* bookings allowed per time slot */
function toast(msg,kind){
 var box=document.getElementById('toasts');
 if(!box){box=h('div','toasts');box.id='toasts';box.setAttribute('role','status');box.setAttribute('aria-live','polite');document.body.appendChild(box)}
 var t=h('div','toast '+(kind||''),msg);box.appendChild(t);
 setTimeout(function(){t.classList.add('out');setTimeout(function(){t.remove()},300)},3200);
}
function isOpenDay(d){var x=new Date(d+'T00:00');return !isNaN(x)&&x.getDay()!==0} /* closed on Sundays */
function slotCount(date,time){return AS.get('as_bookings',[]).filter(function(b){return b.date===date&&b.time===time&&(b.status==='Pending'||b.status==='Confirmed')}).length}
function isPast(date,time){var n=new Date();return date===today()&&tmin(time)<=n.getHours()*60+n.getMinutes()}
function csvCell(v){v=v==null?'':String(v);if(/^[=+\-@]/.test(v))v="'"+v; /* blocks spreadsheet formula injection */return '"'+v.replace(/"/g,'""')+'"'}
function downloadCSV(name,rows){
 var csv='\uFEFF'+rows.map(function(r){return r.map(csvCell).join(',')}).join('\r\n');
 var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},1000);
}
function confirmDlg(title,note,yesText,onYes){
 openDlg(title,note,function(){},[[yesText,'',function(){dlg.close();onYes()}],['Keep it','ghost',function(){dlg.close()}]]);
}
/* A customer may cancel only their own Pending or Confirmed booking that has not been completed. */
function canCancel(b){return b&&(b.status==='Pending'||b.status==='Confirmed')}
function cancelBooking(ref,after){
 var arr=AS.get('as_bookings',[]),mineB=arr.filter(function(x){return x.ref===ref&&((x.owner||'').toLowerCase()===me.email||(x.email||'').toLowerCase()===me.email)})[0];
 if(!mineB||!canCancel(mineB))return;
 confirmDlg('Cancel this booking?','Reference '+ref+'. This frees your time slot. You can book again anytime.','Yes, cancel booking',function(){
  arr.forEach(function(x){if(x.ref===ref)x.status='Cancelled'});AS.set('as_bookings',arr);toast('Booking '+ref+' cancelled');after&&after();
 });
}
function setStatus(ref,val){var arr=AS.get('as_bookings',[]);arr.forEach(function(x){if(x.ref!==ref)return;x.status=val;if(val==='Completed'){if(!x.completedAt)x.completedAt=Date.now()}else delete x.completedAt});AS.set('as_bookings',arr)}
/* ---- income (completed bookings only) ---- */
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function incomeDate(b){return b.completedAt?ymd(new Date(b.completedAt)):(b.date||'')}
function periodRange(p){
 var n=new Date(),y=n.getFullYear(),m=n.getMonth();
 if(p==='day')return [ymd(n),ymd(n)];
 if(p==='week'){var s=new Date(y,m,n.getDate()-((n.getDay()+6)%7));var e=new Date(s.getFullYear(),s.getMonth(),s.getDate()+6);return [ymd(s),ymd(e)]}
 if(p==='month')return [ymd(new Date(y,m,1)),ymd(new Date(y,m+1,0))];
 if(p==='year')return [y+'-01-01',y+'-12-31'];
 return ['0000-00-00','9999-99-99'];
}
function inPeriod(done,p){var r=periodRange(p);return done.filter(function(b){var d=incomeDate(b);return d>=r[0]&&d<=r[1]})}
function sumTotal(rows){return rows.reduce(function(a,b){return a+(Number(b.total)||0)},0)}
function statusSelect(b,after){
 var st=h('select','statussel');STATUS.forEach(function(x){var o=h('option','',x);o.value=x;st.appendChild(o)});
 st.value=b.status;st.setAttribute('aria-label','Status for '+b.ref);
 st.addEventListener('change',function(){setStatus(b.ref,st.value);toast(b.ref+' marked '+st.value,st.value==='Cancelled'?'warn':'ok');after&&after()});return st;
}
function whoCell(b){var w=h('div');w.appendChild(h('strong','',b.name));w.appendChild(h('br'));w.appendChild(h('small','',b.mobile));return w}
function customerDetails(u,hist){
 openDlg('Customer details','',function(body){
  var dl=h('dl');[['Name',u.name],['Email',u.email],['Mobile number',u.phone||'-'],['Total bookings',String(hist.length)]].forEach(function(r){dl.appendChild(h('dt','',r[0]));dl.appendChild(h('dd','',r[1]))});body.appendChild(dl);
  body.appendChild(h('h3','mini','Booking history'));
  if(!hist.length)body.appendChild(h('p','empty','No bookings yet.'));
  else hist.forEach(function(b){var row=h('div','histrow');row.appendChild(h('span','',b.service+' \u00B7 '+fmtDate(b.date)));row.appendChild(badge(b.status));body.appendChild(row)});
 },[['Close','ghost',function(){dlg.close()}]]);
}
function customerRows(users){return users.map(function(u){var hist=mine(u.email);return [u.name,u.email,u.phone||'-',String(hist.length),btn('Details','ghost',function(){customerDetails(u,hist)})]})}