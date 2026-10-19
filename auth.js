/* Demo auth. Data lives in this browser only (localStorage). Not secure for production.
   Passwords are stored as salted SHA-256 hashes, never as plain text. */
/* Compact synchronous SHA-256 (works on http and file:// where crypto.subtle is unavailable). */
function sha256(str){
 var K=[],H=[],i,j,p=2,w=[];
 function frac(x){return (x-Math.floor(x))*4294967296|0}
 for(i=0;K.length<64;p++){for(j=2;j*j<=p&&p%j;j++);if(j*j>p){if(H.length<8)H.push(frac(Math.pow(p,.5)));K.push(frac(Math.pow(p,1/3)))}}
 var m=unescape(encodeURIComponent(str)),n=m.length,bytes=[];
 for(i=0;i<n;i++)bytes[i>>2]|=m.charCodeAt(i)<<((3-i%4)*8);
 bytes[n>>2]|=0x80<<((3-n%4)*8);
 var len=(((n+8)>>6)+1)*16;bytes[len-1]=n*8;bytes[len-2]=Math.floor(n*8/4294967296);
 for(i=0;i<len;i++)if(bytes[i]===undefined)bytes[i]=0;
 function rr(x,c){return (x>>>c)|(x<<(32-c))}
 for(var o=0;o<len;o+=16){
  var a=H.slice(0);
  for(i=0;i<64;i++){
   if(i<16)w[i]=bytes[o+i];
   else{var s0=rr(w[i-15],7)^rr(w[i-15],18)^(w[i-15]>>>3),s1=rr(w[i-2],17)^rr(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0}
   var S1=rr(a[4],6)^rr(a[4],11)^rr(a[4],25),ch=(a[4]&a[5])^(~a[4]&a[6]),t1=(a[7]+S1+ch+K[i]+w[i])|0;
   var S0=rr(a[0],2)^rr(a[0],13)^rr(a[0],22),mj=(a[0]&a[1])^(a[0]&a[2])^(a[1]&a[2]),t2=(S0+mj)|0;
   a=[(t1+t2)|0,a[0],a[1],a[2],(a[3]+t1)|0,a[4],a[5],a[6]];
  }
  for(i=0;i<8;i++)H[i]=(H[i]+a[i])|0;
 }
 return H.map(function(x){return ('00000000'+(x>>>0).toString(16)).slice(-8)}).join('');
}
function newSalt(){var s='',a='0123456789abcdef';try{var r=new Uint8Array(8);crypto.getRandomValues(r);for(var i=0;i<r.length;i++)s+=a[r[i]>>4]+a[r[i]&15]}catch(e){s=String(Date.now())+Math.random().toString(16).slice(2)}return s}
function hashPass(salt,pass){return sha256(salt+':'+pass)}

var AS={
 get:function(k,d){try{var v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},
 set:function(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},
 users:function(){
  var u=this.get('as_users',null),dirty=false;
  if(!u){u=[{role:'admin',name:'Administrator',email:'admin@automotive.com',pass:'admin123'}];dirty=true}
  u.forEach(function(x){if(!x.salt){x.salt=newSalt();x.pass=hashPass(x.salt,x.pass||'');dirty=true}}); /* upgrades older plain-text accounts */
  if(dirty)this.set('as_users',u);
  return u;
 },
 session:function(){return this.get('as_session',null)},
 login:function(email,pass,role){var e=email.trim().toLowerCase();var u=this.users().filter(function(x){return x.email===e&&x.pass===hashPass(x.salt,pass)&&x.role===role})[0];if(u){this.set('as_session',{name:u.name,email:u.email,role:u.role,phone:u.phone||''});return u}return null},
 register:function(role,name,email,pass,phone){var e=email.trim().toLowerCase();var all=this.users();if(all.some(function(x){return x.email===e}))return 'That email is already registered.';var salt=newSalt();all.push({role:role,name:name.trim(),email:e,salt:salt,pass:hashPass(salt,pass),phone:phone||''});this.set('as_users',all);return null},
 logout:function(){try{localStorage.removeItem('as_session')}catch(e){}}
};
document.addEventListener('DOMContentLoaded',function(){
 var box=document.querySelector('.nav-auth');if(!box)return;
 var s=AS.session();
 if(s){box.innerHTML='<a class="textlink" href="dashboard.html">Dashboard</a><a class="textlink" href="#" id="logoutLink">Log out</a>';
  document.getElementById('logoutLink').addEventListener('click',function(e){e.preventDefault();AS.logout();location.reload()})}
 else{box.innerHTML='<a class="textlink" href="login.html">Log in</a>'}
});

document.addEventListener('DOMContentLoaded',function(){
 var nav=document.querySelector('nav'),b=document.querySelector('.menu-btn');if(!nav||!b)return;
 function set(o){nav.classList.toggle('open',o);b.setAttribute('aria-expanded',o);b.setAttribute('aria-label',o?'Close menu':'Open menu')}
 b.addEventListener('click',function(){set(!nav.classList.contains('open'))});
 nav.querySelectorAll('.links a').forEach(function(l){l.addEventListener('click',function(){set(false)})});
 document.addEventListener('keydown',function(e){if(e.key==='Escape')set(false)});
 window.addEventListener('resize',function(){if(window.innerWidth>900)set(false)});
});