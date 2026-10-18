/* Demo auth. Data lives in this browser only (localStorage). Not secure for production. */
var AS={
 get:function(k,d){try{var v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},
 set:function(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},
 users:function(){var u=this.get('as_users',null);if(!u){u=[{role:'admin',name:'Administrator',email:'admin@automotive.com',pass:'admin123'}];this.set('as_users',u)}return u},
 session:function(){return this.get('as_session',null)},
 login:function(email,pass,role){var e=email.trim().toLowerCase();var u=this.users().filter(function(x){return x.email===e&&x.pass===pass&&x.role===role})[0];if(u){this.set('as_session',{name:u.name,email:u.email,role:u.role,phone:u.phone||''});return u}return null},
 register:function(role,name,email,pass,phone){var e=email.trim().toLowerCase();var all=this.users();if(all.some(function(x){return x.email===e}))return 'That email is already registered.';all.push({role:role,name:name.trim(),email:e,pass:pass,phone:phone||''});this.set('as_users',all);return null},
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