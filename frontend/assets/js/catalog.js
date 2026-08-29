// عدّل هذا فقط إذا كان الفرونت مستضاف على نطاق مختلف عن الـ API
const API_BASE = '';

const grid = document.getElementById('grid');
const countLabel = document.getElementById('countLabel');
const searchInput = document.getElementById('searchInput');
const filters = document.getElementById('filters');

let activeCategory = '';
let debounceTimer = null;

function skeletonCards(n){
  let html = '';
  for(let i=0;i<n;i++){
    html += `<div class="card skel-card">
      <div class="img-wrap skel"></div>
      <div class="card-body">
        <div class="skel" style="height:13px;border-radius:3px;margin-bottom:6px;"></div>
        <div class="skel" style="height:10px;width:60%;border-radius:3px;"></div>
      </div>
    </div>`;
  }
  return html;
}

function placeholderIcon(){
  return `<div class="img-placeholder">
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="m21 15-5-5L5 21"/>
    </svg>
  </div>`;
}

function renderProducts(products){
  if(!products || products.length === 0){
    grid.innerHTML = `<div class="empty">
      <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <h3>ما لقيناش أي نتيجة</h3>
      <p>جرّب كلمة بحث ثانية أو رقم OEM مختلف</p>
    </div>`;
    return;
  }

  grid.innerHTML = products.map(p => {
    const img = (p.images && p.images.length > 0)
      ? `<img src="${p.images[0]}" alt="${escapeHtml(p.name)}" loading="lazy">`
      : placeholderIcon();

    const offers = p.offers_count || 0;
    const badge = offers > 0
      ? `<div class="badge">${offers} عرض${offers > 1 ? 'اً' : ''}</div>`
      : `<div class="badge none">لا يوجد عروض بعد</div>`;

    return `<a class="card" href="/product.html?id=${p.id}">
      <div class="img-wrap">
        <span class="punch"></span>
        ${img}
        ${badge}
      </div>
      <div class="card-body">
        <div class="card-name">${escapeHtml(p.name)}</div>
        <div class="card-oem">${escapeHtml(p.oem_number || '—')}</div>
      </div>
    </a>`;
  }).join('');
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function loadCatalog(){
  grid.innerHTML = skeletonCards(10);
  countLabel.textContent = 'جارِ التحميل…';

  try{
    const q = searchInput.value.trim();
    const params = new URLSearchParams();
    if(q) params.set('search', q);

    const res = await fetch(`${API_BASE}/api/catalog/search?${params.toString()}`);
    const data = await res.json();

    if(!data.success){
      countLabel.textContent = 'تعذّر تحميل الكتالوج';
      grid.innerHTML = `<div class="empty"><h3>صار خطأ</h3><p>${escapeHtml(data.error || '')}</p></div>`;
      return;
    }

    let products = data.products || [];
    if(activeCategory){
      products = products.filter(p => (p.category || '').includes(activeCategory));
    }

    countLabel.textContent = `${products.length} قطعة`;
    renderProducts(products);
  }catch(err){
    countLabel.textContent = 'تعذّر الاتصال بالخادم';
    grid.innerHTML = `<div class="empty"><h3>لا يوجد اتصال</h3><p>تأكد من الشبكة وحاول مجدداً</p></div>`;
  }
}

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadCatalog, 350);
});

filters.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if(!chip) return;
  filters.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  activeCategory = chip.dataset.cat || '';
  loadCatalog();
});

loadCatalog();

// تبديل الرابط: "طلباتي" للمشتري المسجَّل دخوله، أو "تسجيل الدخول" للزائر/غير المشتري
(function(){
  const token = localStorage.getItem('user_token');
  const profile = JSON.parse(localStorage.getItem('user_profile') || 'null');
  const authLink = document.getElementById('authLink');
  const logoutBtn = document.getElementById('logoutBtn');
  
  if(token && profile && profile.role === 'buyer'){
    authLink.href = '/my-orders.html';
    authLink.textContent = 'طلباتي';
    logoutBtn.style.display = 'inline-flex';
  } else if(token) {
    logoutBtn.style.display = 'inline-flex';
  }
})();

function logout() {
  localStorage.removeItem('user_token');
  localStorage.removeItem('user_profile');
  localStorage.removeItem('user_role');
  window.location.href = '/login.html';
}
