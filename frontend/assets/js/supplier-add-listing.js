const API_BASE = '';
const userToken = localStorage.getItem('user_token');
const userProfile = JSON.parse(localStorage.getItem('user_profile') || 'null');

// ===== حماية الصفحة: للموردين فقط =====
if(!userToken || !userProfile || userProfile.role !== 'supplier'){
  window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
}

function authHeaders(){
  return { 'x-user-token': userToken };
}
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ===== خريطة عروض المورّد الحالية (product_id -> بيانات العرض) =====
// تُحمَّل عند فتح الصفحة باش شاشة البحث تعرف مباشرة أي منتج قدّم عليه المورّد عرضاً
let myListingsMap = {};
let myListingsRaw = [];

async function fetchMyListings(){
  try{
    const res = await fetch(`${API_BASE}/api/supplier/listings`, { headers: authHeaders() });
    const data = await res.json();
    if(data.success){
      myListingsRaw = data.listings;
      myListingsMap = {};
      data.listings.forEach(l => { myListingsMap[l.product_id] = l; });
    }
  }catch(err){ /* تجاهل - البحث يبقى يشتغل بدون هذه المعلومة */ }
}
fetchMyListings();

// ===== معاينة الصورة كاملة (Lightbox) =====
const lightboxOverlay = document.getElementById('lightboxOverlay');
const lightboxImg = document.getElementById('lightboxImg');
function openLightbox(src){
  if(!src) return;
  lightboxImg.src = src;
  lightboxOverlay.classList.add('open');
}
document.getElementById('closeLightbox').addEventListener('click', () => lightboxOverlay.classList.remove('open'));
lightboxOverlay.addEventListener('click', (e) => { if(e.target === lightboxOverlay) lightboxOverlay.classList.remove('open'); });

// ===== تعديل سعر عرض قائم =====
const priceEditOverlay = document.getElementById('priceEditOverlay');
function openPriceEdit(listingId, productName, currentPrice){
  document.getElementById('priceEditName').textContent = productName;
  document.getElementById('priceEditInput').value = currentPrice;
  document.getElementById('priceEditMsg').className = 'form-msg';
  document.getElementById('savePriceBtn').dataset.listingId = listingId;
  priceEditOverlay.classList.add('open');
}
document.getElementById('closePriceEdit').addEventListener('click', () => priceEditOverlay.classList.remove('open'));
priceEditOverlay.addEventListener('click', (e) => { if(e.target === priceEditOverlay) priceEditOverlay.classList.remove('open'); });

document.getElementById('savePriceBtn').addEventListener('click', async function(){
  const listingId = this.dataset.listingId;
  const newPrice = document.getElementById('priceEditInput').value;
  const msgEl = document.getElementById('priceEditMsg');
  msgEl.className = 'form-msg';
  if(!newPrice || parseFloat(newPrice) <= 0){ msgEl.className='form-msg error'; msgEl.textContent='السعر غير صحيح'; return; }

  this.disabled = true; this.textContent = 'جارِ الحفظ…';
  try{
    const res = await fetch(`${API_BASE}/api/supplier/listings/${listingId}/price`, {
      method:'POST',
      headers: { ...authHeaders(), 'Content-Type':'application/json' },
      body: JSON.stringify({ price: newPrice })
    });
    const data = await res.json();
    if(data.success){
      msgEl.className='form-msg success';
      msgEl.textContent = 'تم تحديث السعر، بانتظار موافقة الإدارة من جديد';
      await fetchMyListings();
      setTimeout(() => {
        priceEditOverlay.classList.remove('open');
        runCatalogSearch();
        if(document.getElementById('panel-mine').classList.contains('active')) loadMyListings();
      }, 900);
    } else {
      msgEl.className='form-msg error';
      msgEl.textContent = data.error || 'فشل تحديث السعر';
    }
  }catch(err){
    msgEl.className='form-msg error';
    msgEl.textContent = 'تعذّر الاتصال بالخادم';
  }finally{
    this.disabled = false; this.textContent = 'حفظ السعر الجديد';
  }
});

// ===== التبويبات =====
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    if(tab.dataset.tab === 'mine') loadMyListings();
    if(tab.dataset.tab === 'proposals') loadMyProposals();
  });
});

// ===== بحث الكتالوج =====
const catalogSearch = document.getElementById('catalogSearch');
const resultList = document.getElementById('resultList');
let searchDebounce;

catalogSearch.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(runCatalogSearch, 350);
});

const statusLabelsShort = { pending:'قيد المراجعة', approved:'✓ معتمد · تعديل السعر', rejected:'مرفوض · تعديل السعر' };

async function runCatalogSearch(){
  const q = catalogSearch.value.trim();
  resultList.innerHTML = `<div class="loading">جارِ البحث…</div>`;
  try{
    const params = new URLSearchParams();
    if(q) params.set('search', q);
    const res = await fetch(`${API_BASE}/api/catalog/search?${params}`);
    const data = await res.json();
    if(!data.success || !data.products.length){
      resultList.innerHTML = q ? `<div class="empty">لا توجد نتائج مطابقة</div>` : '';
      return;
    }
    resultList.innerHTML = data.products.map(p => {
      const imgUrl = (p.images && p.images[0]) || '';
      const img = imgUrl
        ? `<img src="${imgUrl}" alt="${escapeHtml(p.name)}" data-full="${imgUrl}">`
        : `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`;

      const existing = myListingsMap[p.id];
      const btn = existing
        ? `<button class="mini-btn already-offered ${existing.approval_status}" data-mode="edit" data-listing-id="${existing.id}" data-name="${escapeHtml(p.name)}" data-price="${existing.price}">${statusLabelsShort[existing.approval_status] || 'عرضك مقدَّم'}</button>`
        : `<button class="mini-btn" data-mode="add" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-img="${imgUrl}">+ أضف عرضك</button>`;

      return `<div class="result-card">
        <div class="result-img">
          <span class="punch"></span>
          ${img}
          ${btn}
        </div>
        <div class="result-body">
          <div class="result-name">${escapeHtml(p.name)}</div>
          <div class="result-oem">${escapeHtml(p.oem_number || '—')}</div>
        </div>
      </div>`;
    }).join('');

    resultList.querySelectorAll('.result-img img').forEach(img => {
      img.addEventListener('click', () => openLightbox(img.dataset.full));
    });

    resultList.querySelectorAll('.mini-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if(btn.dataset.mode === 'edit'){
          openPriceEdit(btn.dataset.listingId, btn.dataset.name, btn.dataset.price);
        } else {
          openListingForm(btn.dataset.id, btn.dataset.name, btn.dataset.img);
        }
      });
    });
  }catch(err){
    resultList.innerHTML = `<div class="empty">تعذّر الاتصال بالخادم</div>`;
  }
}
runCatalogSearch();

// ===== نموذج اقتراح منتج جديد =====
const proposeForm = document.getElementById('proposeForm');
const listingForm = document.getElementById('listingForm');
let selectedFiles = [];

document.getElementById('openProposeBtn').addEventListener('click', () => {
  listingForm.classList.remove('open');
  proposeForm.classList.toggle('open');
});

const fileDrop = document.getElementById('fileDrop');
const fileInput = document.getElementById('p_images');
fileDrop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  selectedFiles = Array.from(fileInput.files).slice(0, 6);
  fileDrop.textContent = selectedFiles.length ? `${selectedFiles.length} صورة مختارة` : 'اضغط هنا لاختيار الصور';
  fileDrop.classList.toggle('has-files', selectedFiles.length > 0);
  const preview = document.getElementById('filePreview');
  preview.innerHTML = selectedFiles.map(f => `<img src="${URL.createObjectURL(f)}">`).join('');
});

document.getElementById('submitProposeBtn').addEventListener('click', async () => {
  const name = document.getElementById('p_name').value.trim();
  const msgEl = document.getElementById('proposeMsg');
  msgEl.className = 'form-msg';

  if(!name){ msgEl.className='form-msg error'; msgEl.textContent='اسم المنتج مطلوب'; return; }
  if(selectedFiles.length === 0){ msgEl.className='form-msg error'; msgEl.textContent='يجب اختيار صورة واحدة على الأقل'; return; }

  const btn = document.getElementById('submitProposeBtn');
  btn.disabled = true; btn.textContent = 'جارِ الإرسال…';

  try{
    const fd = new FormData();
    fd.append('name', name);
    fd.append('description', document.getElementById('p_description').value.trim());
    fd.append('oem_number', document.getElementById('p_oem').value.trim());
    fd.append('category', document.getElementById('p_category').value);
    selectedFiles.forEach(f => fd.append('images', f));

    const res = await fetch(`${API_BASE}/api/supplier/propose-product`, {
      method:'POST', headers: authHeaders(), body: fd
    });
    const data = await res.json();

    if(data.success){
      msgEl.className='form-msg success';
      msgEl.textContent = 'تم إرسال اقتراحك، بانتظار موافقة الإدارة قبل ما تقدر تضيف عرضك عليه';
      document.getElementById('p_name').value = '';
      document.getElementById('p_description').value = '';
      document.getElementById('p_oem').value = '';
      selectedFiles = []; fileInput.value=''; fileDrop.textContent='اضغط هنا لاختيار الصور'; fileDrop.classList.remove('has-files');
      document.getElementById('filePreview').innerHTML='';
    } else {
      msgEl.className='form-msg error';
      msgEl.textContent = data.error || 'فشل إرسال الاقتراح';
    }
  }catch(err){
    msgEl.className='form-msg error';
    msgEl.textContent = 'تعذّر الاتصال بالخادم';
  }finally{
    btn.disabled = false; btn.textContent = 'إرسال الاقتراح للمراجعة';
  }
});

// ===== نموذج إضافة عرض على منتج موجود =====
let selectedProductId = null;

function openListingForm(id, name, img){
  selectedProductId = id;
  proposeForm.classList.remove('open');
  listingForm.classList.add('open');

  document.getElementById('selectedProductBox').innerHTML = `
    ${img ? `<img src="${img}">` : ''}
    <div class="n">${escapeHtml(name)}</div>
    <div class="change" id="changeProductBtn">تغيير</div>
  `;
  document.getElementById('changeProductBtn').addEventListener('click', () => {
    listingForm.classList.remove('open');
  });
  listingForm.scrollIntoView({behavior:'smooth', block:'start'});
}

// بحث المركبة داخل نموذج العرض
const vehicleSearch = document.getElementById('l_vehicle_search');
const vehicleResults = document.getElementById('vehicleResults');
let vehicleDebounce;

vehicleSearch.addEventListener('input', () => {
  clearTimeout(vehicleDebounce);
  vehicleDebounce = setTimeout(async () => {
    const q = vehicleSearch.value.trim();
    if(!q){ vehicleResults.innerHTML=''; return; }
    try{
      const res = await fetch(`${API_BASE}/api/vehicles?search=${encodeURIComponent(q)}`);
      const data = await res.json();
      if(!data.success || !data.vehicles.length){ vehicleResults.innerHTML = `<div class="empty">لا توجد مركبات مطابقة</div>`; return; }
      vehicleResults.innerHTML = `<div class="row-list">${data.vehicles.map(v =>
        `<div class="row-item" data-id="${v.id}" data-label="${escapeHtml(v.make)} ${escapeHtml(v.model)} (${v.year_start}-${v.year_end})">
          <div><div class="row-name">${escapeHtml(v.make)} ${escapeHtml(v.model)}</div><div class="row-sub">${v.year_start} - ${v.year_end}</div></div>
        </div>`
      ).join('')}</div>`;
      vehicleResults.querySelectorAll('.row-item').forEach(row => {
        row.addEventListener('click', () => {
          document.getElementById('l_vehicle_id').value = row.dataset.id;
          document.getElementById('selectedVehicleLabel').textContent = '✓ ' + row.dataset.label;
          vehicleResults.innerHTML = '';
          vehicleSearch.value = '';
        });
      });
    }catch(err){ vehicleResults.innerHTML = `<div class="empty">تعذّر البحث</div>`; }
  }, 350);
});

document.getElementById('submitListingBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('listingMsg');
  msgEl.className = 'form-msg';

  const vehicleId = document.getElementById('l_vehicle_id').value;
  const price = document.getElementById('l_price').value;

  if(!selectedProductId){ msgEl.className='form-msg error'; msgEl.textContent='اختر منتجاً أولاً'; return; }
  if(!vehicleId){ msgEl.className='form-msg error'; msgEl.textContent='اختر المركبة المتوافقة'; return; }
  if(!price){ msgEl.className='form-msg error'; msgEl.textContent='السعر مطلوب'; return; }

  const btn = document.getElementById('submitListingBtn');
  btn.disabled = true; btn.textContent = 'جارِ الإرسال…';

  try{
    const res = await fetch(`${API_BASE}/api/supplier/listings`, {
      method:'POST',
      headers: { ...authHeaders(), 'Content-Type':'application/json' },
      body: JSON.stringify({
        product_id: selectedProductId,
        vehicle_id: vehicleId,
        price: price,
        quality_grade: document.getElementById('l_grade').value || null,
        brand: document.getElementById('l_brand').value.trim() || null,
        country_of_origin: document.getElementById('l_country').value.trim() || null,
        delivery_type: document.getElementById('l_delivery').value
      })
    });
    const data = await res.json();

    if(data.success){
      msgEl.className='form-msg success';
      msgEl.textContent = 'تم إرسال عرضك، بانتظار موافقة الإدارة';
      document.getElementById('l_price').value='';
      document.getElementById('l_brand').value='';
      document.getElementById('l_country').value='';
      document.getElementById('l_vehicle_id').value='';
      document.getElementById('selectedVehicleLabel').textContent='';
      await fetchMyListings();
      runCatalogSearch();
    } else {
      msgEl.className='form-msg error';
      msgEl.textContent = data.error || 'فشل إرسال العرض';
    }
  }catch(err){
    msgEl.className='form-msg error';
    msgEl.textContent = 'تعذّر الاتصال بالخادم';
  }finally{
    btn.disabled = false; btn.textContent = 'إرسال العرض للمراجعة';
  }
});

// ===== تبويب عروضي =====
const gradeLabels = { grade_1:'نوعية 1', grade_2:'نوعية 2', economy:'اقتصادية' };
const statusLabels = { pending:'قيد المراجعة', approved:'معتمد', rejected:'مرفوض' };

async function loadMyListings(){
  const container = document.getElementById('myListings');
  container.className = 'loading';
  container.textContent = 'جارِ التحميل…';
  try{
    const res = await fetch(`${API_BASE}/api/supplier/listings`, { headers: authHeaders() });
    const data = await res.json();
    if(!data.success){ container.className='empty'; container.textContent = data.error || 'خطأ'; return; }
    if(!data.listings.length){ container.className='empty'; container.textContent = 'ما عندكش عروض بعد'; return; }

    container.className = '';
    container.innerHTML = data.listings.map(l => `
      <div class="listing-card">
        <div class="listing-top">
          <div class="listing-img" data-full="${l.image || ''}">
            ${l.image ? `<img src="${l.image}">` : '📦'}
          </div>
          <div style="flex:1;">
            <div class="listing-name">${escapeHtml(l.product_name)}</div>
            <div class="listing-veh">${escapeHtml(l.make)} ${escapeHtml(l.model)} (${l.year_start}-${l.year_end}) ${l.quality_grade ? '· ' + (gradeLabels[l.quality_grade]||l.quality_grade) : ''}</div>
          </div>
          <span class="status-pill ${l.approval_status}">${statusLabels[l.approval_status]||l.approval_status}</span>
        </div>
        ${l.approval_status === 'rejected' && l.admin_note ? `<div class="rejection-note"><b>سبب الرفض:</b> ${escapeHtml(l.admin_note)}</div>` : ''}
        <div class="listing-bottom">
          <span class="listing-price">${parseFloat(l.price).toLocaleString('ar-DZ')} دج</span>
          <div style="display:flex; align-items:center; gap:10px;">
            ${l.approval_status === 'rejected'
              ? `<button class="delete-listing-btn" data-id="${l.id}">🗑 حذف</button>`
              : `<button class="edit-price-btn" data-id="${l.id}" data-name="${escapeHtml(l.product_name)}" data-price="${l.price}">تعديل السعر</button>
                 <label class="switch">
                   <input type="checkbox" ${l.is_available ? 'checked' : ''} data-id="${l.id}">
                   <span class="switch-track"></span>
                 </label>`
            }
          </div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.listing-img').forEach(box => {
      box.addEventListener('click', () => openLightbox(box.dataset.full));
    });
    container.querySelectorAll('.edit-price-btn').forEach(btn => {
      btn.addEventListener('click', () => openPriceEdit(btn.dataset.id, btn.dataset.name, btn.dataset.price));
    });
    container.querySelectorAll('.delete-listing-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if(!confirm('حذف هذا العرض المرفوض نهائياً؟')) return;
        try{
          const res = await fetch(`${API_BASE}/api/supplier/listings/${btn.dataset.id}`, {
            method:'DELETE', headers: authHeaders()
          });
          const data = await res.json();
          if(data.success) loadMyListings();
          else alert(data.error || 'فشل الحذف');
        }catch(err){ alert('تعذّر الاتصال بالخادم'); }
      });
    });

    container.querySelectorAll('.switch input').forEach(sw => {
      sw.addEventListener('change', async () => {
        try{
          await fetch(`${API_BASE}/api/supplier/listings/${sw.dataset.id}/availability`, {
            method:'POST',
            headers: { ...authHeaders(), 'Content-Type':'application/json' },
            body: JSON.stringify({ is_available: sw.checked })
          });
        }catch(err){ sw.checked = !sw.checked; }
      });
    });
  }catch(err){
    container.className='empty'; container.textContent='تعذّر الاتصال بالخادم';
  }
}

async function loadMyProposals(){
  const container = document.getElementById('myProposals');
  container.className = 'loading';
  container.textContent = 'جارِ التحميل…';
  try{
    const res = await fetch(`${API_BASE}/api/supplier/proposed-products`, { headers: authHeaders() });
    const data = await res.json();
    if(!data.success){ container.className='empty'; container.textContent = data.error || 'خطأ'; return; }
    if(!data.products.length){ container.className='empty'; container.textContent = 'ما اقترحتش أي منتج جديد بعد'; return; }

    container.className = '';
    container.innerHTML = data.products.map(p => `
      <div class="listing-card">
        <div class="listing-top">
          <div class="listing-img" data-full="${p.image || ''}">
            ${p.image ? `<img src="${p.image}">` : '📦'}
          </div>
          <div style="flex:1;">
            <div class="listing-name">${escapeHtml(p.name)}</div>
            <div class="listing-veh">${escapeHtml(p.oem_number || '—')} ${p.category ? '· ' + escapeHtml(p.category) : ''}</div>
          </div>
          <span class="status-pill ${p.approval_status}">${statusLabels[p.approval_status]||p.approval_status}</span>
        </div>
        ${p.approval_status === 'rejected' && p.admin_note ? `<div class="rejection-note"><b>سبب الرفض:</b> ${escapeHtml(p.admin_note)}</div>` : ''}
        ${p.approval_status === 'rejected' ? `<div class="listing-bottom" style="justify-content:flex-end;"><button class="delete-proposal-btn" data-id="${p.id}">🗑 حذف</button></div>` : ''}
      </div>
    `).join('');

    container.querySelectorAll('.listing-img').forEach(box => {
      box.addEventListener('click', () => openLightbox(box.dataset.full));
    });
    container.querySelectorAll('.delete-proposal-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if(!confirm('حذف هذا الاقتراح المرفوض نهائياً؟')) return;
        try{
          const res = await fetch(`${API_BASE}/api/supplier/proposed-products/${btn.dataset.id}`, {
            method:'DELETE', headers: authHeaders()
          });
          const data = await res.json();
          if(data.success) loadMyProposals();
          else alert(data.error || 'فشل الحذف');
        }catch(err){ alert('تعذّر الاتصال بالخادم'); }
      });
    });
  }catch(err){
    container.className='empty'; container.textContent='تعذّر الاتصال بالخادم';
  }
}
