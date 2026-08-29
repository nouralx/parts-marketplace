  const API_BASE = window.location.origin;
  const token = localStorage.getItem('admin_token');

  if (!token) {
    window.location.href = 'admin-login.html';
  }

  document.getElementById('adminName').textContent = localStorage.getItem('admin_name') || '';

  function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_role');
    localStorage.removeItem('admin_name');
    window.location.href = 'admin-login.html';
  }

  function showToast(text) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 2500);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #333;
      color: #fff;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      z-index: 2000;
      max-width: 300px;
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  async function apiCall(path, options = {}) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          'x-admin-token': token,
          ...(options.headers || {})
        }
      });

      if (res.status === 401) {
        alert('انتهت الجلسة، سيتم تسجيل خروجك');
        logout();
        return null;
      }

      const data = await res.json();
      
      if (!res.ok) {
        alert('خطأ من الخادم (' + res.status + '): ' + (data.error || 'غير معروف'));
      }
      
      return data;
    } catch (err) {
      alert('فشل الاتصال بالخادم: ' + err.message);
      return null;
    }
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    document.getElementById('panel-' + name).classList.add('active');

    if (name === 'suppliers') loadSupplierRequests();
    if (name === 'catalog') loadCatalog();
    if (name === 'products') loadPendingProducts();
    if (name === 'pricing') loadPendingPricing();
    if (name === 'users') loadUsers();
    if (name === 'log') loadActivityLog();
  }

  // ===== طلبات الموردين =====

  async function loadSupplierRequests() {
    document.getElementById('suppliersLoading').style.display = 'block';
    document.getElementById('suppliersList').innerHTML = '';
    document.getElementById('suppliersEmpty').style.display = 'none';

    const data = await apiCall('/api/admin/supplier-requests');
    document.getElementById('suppliersLoading').style.display = 'none';

    if (!data || !data.success) {
      showToast(data?.error || 'فشل تحميل الطلبات');
      return;
    }

    if (data.requests.length === 0) {
      document.getElementById('suppliersEmpty').style.display = 'block';
      return;
    }

    const listEl = document.getElementById('suppliersList');
    data.requests.forEach(req => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-header">
          <div class="card-title">${escapeHtml(req.full_name)}</div>
          <div class="card-sub">${new Date(req.created_at).toLocaleDateString('ar-DZ')}</div>
        </div>
        <div class="card-sub">📞 ${escapeHtml(req.phone)} · 👤 ${escapeHtml(req.username)}</div>
        <div class="doc-links">
          <a href="#" onclick="viewDocument('${req.commercial_register_url}'); return false;">📄 السجل التجاري</a>
          <a href="#" onclick="viewDocument('${req.payment_receipt_url}'); return false;">🧾 إيصال الدفع</a>
        </div>
        <div class="action-row">
          <button class="btn btn-approve" onclick="reviewSupplier('${req.id}', 'approved')">✓ موافقة</button>
          <button class="btn btn-reject" onclick="reviewSupplier('${req.id}', 'rejected')">✗ رفض</button>
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  async function viewDocument(path) {
    const data = await apiCall(`/api/admin/document-url?path=${encodeURIComponent(path)}`);
    if (data && data.success) {
      window.open(data.url, '_blank');
    } else {
      showToast(data?.error || 'فشل فتح الوثيقة');
    }
  }

  async function reviewSupplier(documentId, decision) {
    let note = '';
    if (decision === 'rejected') {
      note = prompt('اكتب سبب رفض هذا المورّد:');
      if (note === null) return; // تراجع الأدمن
    } else {
      if (!confirm('تأكيد الموافقة على هذا المورّد؟')) return;
    }

    const data = await apiCall('/api/admin/review-supplier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: documentId, decision, note: note || undefined })
    });

    if (data && data.success) {
      showToast(decision === 'approved' ? 'تمت الموافقة بنجاح' : 'تم الرفض');
      loadSupplierRequests();
    } else {
      showToast(data?.error || 'فشل تنفيذ الإجراء');
    }
  }

  // ===== الكتالوج (عرض الزبون) =====
  
  let allCatalogProducts = [];

  async function loadCatalog() {
    document.getElementById('catalogLoading').style.display = 'block';
    document.getElementById('catalogList').innerHTML = '';
    document.getElementById('catalogEmpty').style.display = 'none';
    document.getElementById('catalogSearchInput').value = '';

    try {
      // جلب المنتجات المعتمدة مع الـ token
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/api/admin/all-approved-products`, {
        headers: {
          'x-admin-token': token
        }
      });
      
      const data = await res.json();

      document.getElementById('catalogLoading').style.display = 'none';

      if (!data.success || !data.products) {
        console.error('فشل تحميل المنتجات:', data.error);
        document.getElementById('catalogEmpty').style.display = 'block';
        return;
      }

      allCatalogProducts = data.products;

      if (allCatalogProducts.length === 0) {
        document.getElementById('catalogEmpty').style.display = 'block';
        document.getElementById('catalogProductCount').textContent = '0';
        return;
      }

      document.getElementById('catalogProductCount').textContent = allCatalogProducts.length;
      renderCatalogProducts(allCatalogProducts);

      // إضافة حدث البحث
      document.getElementById('catalogSearchInput').addEventListener('input', filterCatalogProducts);
    } catch (err) {
      console.error('خطأ في تحميل الكتالوج:', err);
      document.getElementById('catalogLoading').style.display = 'none';
      document.getElementById('catalogEmpty').style.display = 'block';
    }
  }

  function renderCatalogProducts(products) {
    const listEl = document.getElementById('catalogList');
    listEl.innerHTML = '';

    if (products.length === 0) {
      document.getElementById('catalogEmpty').style.display = 'block';
      return;
    }

    document.getElementById('catalogEmpty').style.display = 'none';

    products.forEach(product => {
      const item = document.createElement('div');
      item.className = 'catalog-product-item';
      item.onclick = () => openProductDetails(product);
      
      const images = product.image_urls ? product.image_urls.split(',').filter(img => img.trim()) : [];
      const firstImage = images.length > 0 ? images[0].trim() : null;

      let thumbnailHtml = '';
      if (firstImage) {
        thumbnailHtml = `<img src="${firstImage}" alt="${escapeHtml(product.name)}" onerror="this.parentElement.innerHTML='<div class=\\'catalog-product-thumbnail-placeholder\\'>📷</div>'">`;
      } else {
        thumbnailHtml = '<div class="catalog-product-thumbnail-placeholder">📷</div>';
      }

      const createdDate = new Date(product.created_at).toLocaleDateString('ar-DZ');

      item.innerHTML = `
        <div class="catalog-product-thumbnail">
          ${thumbnailHtml}
        </div>
        <div class="catalog-product-content">
          <div class="catalog-product-header">
            <h3 class="catalog-product-title">${escapeHtml(product.name)}</h3>
            <span class="catalog-product-status-badge">✓ معتمد</span>
          </div>
          <div class="catalog-product-details">
            ${product.oem_number ? `<strong>OEM:</strong> ${escapeHtml(product.oem_number)}` : ''}
            ${product.description ? `<br><strong>الوصف:</strong> ${escapeHtml(product.description.substring(0, 50))}...` : ''}
          </div>
          <div class="catalog-product-suppliers">
            <strong>${product.supplier_count || 0}</strong> بائعين متوفرين
          </div>
          <div class="catalog-product-footer">
            <span>${createdDate}</span>
            <span>👁️ اضغط للتفاصيل</span>
          </div>
        </div>
      `;

      listEl.appendChild(item);
    });
  }

  function filterCatalogProducts() {
    const searchText = document.getElementById('catalogSearchInput').value.toLowerCase().trim();

    if (!searchText) {
      renderCatalogProducts(allCatalogProducts);
      document.getElementById('catalogProductCount').textContent = allCatalogProducts.length;
      return;
    }

    const filtered = allCatalogProducts.filter(p => 
      p.name.toLowerCase().includes(searchText) ||
      (p.oem_number && p.oem_number.toLowerCase().includes(searchText)) ||
      (p.description && p.description.toLowerCase().includes(searchText))
    );

    renderCatalogProducts(filtered);
    document.getElementById('catalogProductCount').textContent = filtered.length;
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      background: #111827;
      color: #fff;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      z-index: 2000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  if (!document.getElementById('toastStyles')) {
    const style = document.createElement('style');
    style.id = 'toastStyles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  // ===== تفاصيل المنتج =====

  let currentProductDetail = null;

  async function openProductDetails(product) {
    currentProductDetail = product;

    // ملء البيانات الأساسية
    document.getElementById('detailProductName').textContent = escapeHtml(product.name);
    document.getElementById('detailProductOEM').textContent = product.oem_number || '-';
    document.getElementById('detailProductCategory').textContent = product.category || '-';
    document.getElementById('detailProductStatus').textContent = 'معتمد ✓';

    const createdDate = new Date(product.created_at).toLocaleDateString('ar-DZ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    document.getElementById('detailProductDate').textContent = createdDate;

    // الوصف
    if (product.description) {
      document.getElementById('descriptionSection').style.display = 'block';
      document.getElementById('detailProductDesc').textContent = product.description;
    } else {
      document.getElementById('descriptionSection').style.display = 'none';
    }

    // الصور
    const images = product.image_urls ? product.image_urls.split(',').filter(img => img.trim()) : [];
    const galleryEl = document.getElementById('productImagesGallery');
    galleryEl.innerHTML = '';

    if (images.length > 0) {
      images.forEach((img, idx) => {
        const thumb = document.createElement('img');
        thumb.src = img;
        thumb.alt = `صورة ${idx + 1}`;
        thumb.className = idx === 0 ? 'active' : '';
        thumb.onclick = () => setMainImage(img);
        galleryEl.appendChild(thumb);
      });
      setMainImage(images[0]);
    } else {
      document.getElementById('mainProductImage').src = '';
      document.getElementById('mainProductImage').style.background = '#f3f4f6';
      document.getElementById('mainProductImage').innerHTML = '<span style="font-size:40px">📷</span>';
    }

    // الموردين
    await loadProductSuppliers(product.id);

    // فتح الـ modal
    document.getElementById('productDetailModal').classList.add('open');
  }

  function setMainImage(imageSrc) {
    document.getElementById('mainProductImage').src = imageSrc;
    document.getElementById('mainProductImage').style.background = 'transparent';
    
    // تحديث الـ active في الصور المصغرة
    document.querySelectorAll('.product-images-gallery img').forEach(img => {
      img.classList.remove('active');
      if (img.src === imageSrc) {
        img.classList.add('active');
      }
    });
  }

  async function loadProductSuppliers(productId) {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/api/admin/product-suppliers/${productId}`, {
        headers: { 'x-admin-token': token }
      });

      const data = await res.json();

      const listEl = document.getElementById('suppliersList');
      const emptyEl = document.getElementById('suppliersEmpty');

      if (!data.success || !data.suppliers || data.suppliers.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = 'block';
        document.getElementById('suppliersCount').textContent = '0';
        return;
      }

      emptyEl.style.display = 'none';
      document.getElementById('suppliersCount').textContent = data.suppliers.length;

      listEl.innerHTML = '';
      data.suppliers.forEach(supplier => {
        const item = document.createElement('div');
        item.className = 'supplier-item';
        item.innerHTML = `
          <div class="supplier-name">🏪 ${escapeHtml(supplier.store_name || 'متجر')}</div>
          <div class="supplier-info">
            📍 ${escapeHtml(supplier.wilaya || 'غير محدد')}<br>
            💰 السعر: ${supplier.price ? supplier.price + ' د.ج' : 'غير محدد'}<br>
            📧 البريد: ${escapeHtml(supplier.phone || 'غير متوفر')}<br>
            🚚 التسليم: ${escapeHtml(supplier.delivery_type || 'عادي')}<br>
            🔖 الجودة: ${escapeHtml(supplier.quality_grade || 'معياري')} · 🌍 ${escapeHtml(supplier.country_of_origin || '-')}
          </div>
        `;
        listEl.appendChild(item);
      });
    } catch (err) {
      console.error('خطأ في تحميل الموردين:', err);
      document.getElementById('suppliersList').innerHTML = '';
      document.getElementById('suppliersEmpty').style.display = 'block';
    }
  }

  function closeProductDetails() {
    document.getElementById('productDetailModal').classList.remove('open');
    currentProductDetail = null;
  }

  async function deleteProduct() {
    if (!currentProductDetail) return;

    const confirmed = confirm(`هل أنت متأكد من حذف المنتج "${escapeHtml(currentProductDetail.name)}" من كامل المنصة؟\n\nهذه العملية لا يمكن التراجع عنها!`);
    
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/api/admin/products/${currentProductDetail.id}`, {
        method: 'DELETE',
        headers: {
          'x-admin-token': token,
          'Content-Type': 'application/json'
        }
      });

      const data = await res.json();

      if (data.success) {
        showToast('✅ تم حذف المنتج بنجاح');
        closeProductDetails();
        loadCatalog(); // أعد تحميل الكتالوج
      } else {
        showToast('❌ ' + (data.error || 'فشل حذف المنتج'));
      }
    } catch (err) {
      console.error('خطأ في الحذف:', err);
      showToast('❌ حدث خطأ في الحذف');
    }
  }

  // ===== المنتجات المعلقة =====

  async function loadPendingProducts() {
    document.getElementById('productsLoading').style.display = 'block';
    document.getElementById('productsList').innerHTML = '';
    document.getElementById('productsEmpty').style.display = 'none';

    const data = await apiCall('/api/admin/pending-products');
    document.getElementById('productsLoading').style.display = 'none';

    if (!data || !data.success) {
      showToast(data?.error || 'فشل تحميل المنتجات');
      return;
    }

    if (data.products.length === 0) {
      document.getElementById('productsEmpty').style.display = 'block';
      return;
    }

    const listEl = document.getElementById('productsList');
    data.products.forEach(p => {
      const card = document.createElement('div');
      card.className = 'card';

      const imagesHtml = (p.images || []).map(url => `<img src="${url}" onclick="window.open('${url}','_blank')" />`).join('');

      card.innerHTML = `
        <div class="card-header">
          <div class="card-title">${escapeHtml(p.name)}</div>
          <div class="card-sub">${new Date(p.created_at).toLocaleDateString('ar-DZ')}</div>
        </div>
        <div class="card-sub">🏬 ${escapeHtml(p.store_name)} · 👤 ${escapeHtml(p.full_name)} · 📞 ${escapeHtml(p.phone)}</div>
        <div class="card-sub" style="margin-top:6px;">${escapeHtml(p.category || '')} · الحالة: ${escapeHtml(p.condition)} · المخزون: ${p.stock_quantity}</div>
        ${p.description ? `<div class="card-sub" style="margin-top:6px;">${escapeHtml(p.description)}</div>` : ''}
        ${p.oem_number ? `<div class="card-sub">رقم OEM: ${escapeHtml(p.oem_number)}</div>` : ''}
        <div class="product-images-row">${imagesHtml}</div>
        <div class="action-row">
          <button class="btn btn-approve" onclick="reviewProduct(${p.id}, 'approved')">✓ موافقة</button>
          <button class="btn btn-reject" onclick="reviewProduct(${p.id}, 'rejected')">✗ رفض</button>
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  async function reviewProduct(productId, decision) {
    let note = '';
    if (decision === 'rejected') {
      note = prompt('اكتب سبب رفض هذا المنتج (إلزامي):');
      if (note === null) return; // تراجع الأدمن
      if (!note.trim()) { showToast('سبب الرفض مطلوب'); return; }
    } else {
      if (!confirm('تأكيد الموافقة على هذا المنتج؟')) return;
    }

    const data = await apiCall('/api/admin/review-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, decision, note: note || undefined })
    });

    if (data && data.success) {
      showToast(decision === 'approved' ? 'تمت الموافقة بنجاح' : 'تم الرفض');
      loadPendingProducts();
    } else {
      showToast(data?.error || 'فشل تنفيذ الإجراء');
    }
  }

  // ===== الأسعار المعلقة =====

  async function loadPendingPricing() {
    document.getElementById('pricingLoading').style.display = 'block';
    document.getElementById('pricingList').innerHTML = '';
    document.getElementById('pricingEmpty').style.display = 'none';

    const data = await apiCall('/api/admin/pending-pricing');
    document.getElementById('pricingLoading').style.display = 'none';

    if (!data || !data.success) {
      showToast(data?.error || 'فشل تحميل الأسعار');
      return;
    }

    if (data.pricing.length === 0) {
      document.getElementById('pricingEmpty').style.display = 'block';
      return;
    }

    const listEl = document.getElementById('pricingList');
    data.pricing.forEach(pr => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-header">
          <div class="card-title">${escapeHtml(pr.product_name)}</div>
          <div class="card-sub">${new Date(pr.created_at).toLocaleDateString('ar-DZ')}</div>
        </div>
        <div class="card-sub">🏬 ${escapeHtml(pr.store_name)}</div>
        <div class="card-sub" style="margin-top:6px;">🚗 ${escapeHtml(pr.make)} ${escapeHtml(pr.model)} (${pr.year_start}-${pr.year_end})</div>
        <div class="price-tag">السعر المقترح: <b>${pr.price}</b> دج</div>
        <div class="action-row">
          <button class="btn btn-approve" onclick="reviewPricing(${pr.id}, 'approved')">✓ موافقة</button>
          <button class="btn btn-reject" onclick="reviewPricing(${pr.id}, 'rejected')">✗ رفض</button>
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  async function reviewPricing(pricingId, decision) {
    let note = '';
    if (decision === 'rejected') {
      note = prompt('اكتب سبب رفض هذا السعر (إلزامي):');
      if (note === null) return; // تراجع الأدمن
      if (!note.trim()) { showToast('سبب الرفض مطلوب'); return; }
    } else {
      if (!confirm('تأكيد الموافقة على هذا السعر؟')) return;
    }

    const data = await apiCall('/api/admin/review-pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pricing_id: pricingId, decision, note: note || undefined })
    });

    if (data && data.success) {
      showToast(decision === 'approved' ? 'تمت الموافقة بنجاح' : 'تم الرفض');
      loadPendingPricing();
    } else {
      showToast(data?.error || 'فشل تنفيذ الإجراء');
    }
  }

  // ===== المستخدمون =====

  async function loadUsers() {
    document.getElementById('usersLoading').style.display = 'block';
    document.getElementById('usersList').innerHTML = '';

    const data = await apiCall('/api/admin/users');
    document.getElementById('usersLoading').style.display = 'none';

    if (!data || !data.success) {
      showToast(data?.error || 'فشل تحميل المستخدمين');
      return;
    }

    const listEl = document.getElementById('usersList');
    data.users.forEach(u => {
      const card = document.createElement('div');
      card.className = 'card';
      const roleBadge = u.role === 'buyer' 
        ? '<span class="badge badge-buyer">مشترٍ</span>' 
        : '<span class="badge badge-supplier">مورّد</span>';
      const statusBadge = u.is_active 
        ? '<span class="badge badge-active">نشط</span>' 
        : '<span class="badge badge-inactive">موقوف</span>';

      card.innerHTML = `
        <div class="card-header">
          <div class="card-title user-name-link" onclick="openUserDetail('${u.id}', '${escapeHtml(u.full_name)}')">${escapeHtml(u.full_name)}</div>
          <div>${roleBadge}</div>
        </div>
        <div class="card-sub">📞 ${escapeHtml(u.phone)} · 👤 ${escapeHtml(u.username)}</div>
        <div class="card-sub" style="margin-top:6px;">${statusBadge}</div>
        <div class="action-row">
          <button class="btn ${u.is_active ? 'btn-toggle-on' : 'btn-toggle-off'}" 
                  onclick="toggleUserStatus('${u.id}', ${!u.is_active})">
            ${u.is_active ? '⛔ تعطيل الحساب' : '✓ تفعيل الحساب'}
          </button>
          <button class="btn btn-delete" onclick="deleteUser('${u.id}', '${escapeHtml(u.full_name)}')">
            🗑️ حذف المستخدم
          </button>
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  async function toggleUserStatus(userId, newStatus) {
    const confirmMsg = newStatus ? 'تفعيل هذا الحساب؟' : 'تعطيل هذا الحساب؟';
    if (!confirm(confirmMsg)) return;

    const data = await apiCall('/api/admin/toggle-user-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, is_active: newStatus })
    });

    if (data && data.success) {
      showToast('تم التحديث بنجاح');
      loadUsers();
    } else {
      showToast(data?.error || 'فشل تنفيذ الإجراء');
    }
  }

  async function deleteUser(userId, userName) {
    const confirmed = confirm(`هل أنت متأكد من حذف المستخدم "${userName}" وجميع بياناته من المنصة؟\n\nهذه العملية لا يمكن التراجع عنها!`);
    
    if (!confirmed) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'x-admin-token': localStorage.getItem('admin_token'),
          'Content-Type': 'application/json'
        }
      });

      const data = await res.json();

      if (data.success) {
        showToast('✅ تم حذف المستخدم وجميع بياناته بنجاح');
        loadUsers();
      } else {
        showToast('❌ ' + (data.error || 'فشل حذف المستخدم'));
      }
    } catch (err) {
      console.error('خطأ في حذف المستخدم:', err);
      showToast('❌ حدث خطأ في الحذف');
    }
  }

  // ===== تفاصيل المستخدم/المورد =====

  async function openUserDetail(userId, userName) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/user-detail/${userId}`, {
        headers: {
          'x-admin-token': localStorage.getItem('admin_token')
        }
      });

      const data = await res.json();

      if (!data.success || !data.user) {
        showToast('❌ فشل تحميل البيانات');
        return;
      }

      const user = data.user;

      // ملء البيانات الأساسية
      document.getElementById('userDetailName').textContent = escapeHtml(user.full_name || '-');
      document.getElementById('detailFullName').textContent = escapeHtml(user.full_name || '-');
      document.getElementById('detailUsername').textContent = escapeHtml(user.username || '-');
      document.getElementById('detailEmail').textContent = escapeHtml(user.email || '-');
      document.getElementById('detailPhone').textContent = escapeHtml(user.phone || '-');
      document.getElementById('detailRole').textContent = escapeHtml(user.role || '-');
      document.getElementById('detailStatus').textContent = user.is_active ? '✅ نشط' : '❌ معطل';

      // التواريخ
      if (user.created_at) {
        const createdDate = new Date(user.created_at).toLocaleDateString('ar-DZ', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        document.getElementById('detailCreatedAt').textContent = createdDate;
      }

      if (user.updated_at) {
        const updatedDate = new Date(user.updated_at).toLocaleDateString('ar-DZ', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        document.getElementById('detailUpdatedAt').textContent = updatedDate;
      }

      // الصور
      if (user.record_image) {
        document.getElementById('recordImage').src = user.record_image;
      }
      if (user.payment_image) {
        document.getElementById('paymentImage').src = user.payment_image;
      }

      // معلومات المورد (إذا كان موردًا)
      const supplierSection = document.getElementById('supplierSection');
      if (user.store_name) {
        supplierSection.style.display = 'block';
        document.getElementById('detailStoreName').textContent = escapeHtml(user.store_name || '-');
        document.getElementById('detailWilaya').textContent = escapeHtml(user.wilaya || '-');
        document.getElementById('detailVerified').textContent = user.is_verified ? '✅ موثق' : '❌ غير موثق';
        document.getElementById('detailNationalId').textContent = escapeHtml(user.national_id || '-');
      } else {
        supplierSection.style.display = 'none';
      }

      // فتح النافذة
      document.getElementById('userDetailModal').classList.add('open');
    } catch (err) {
      console.error('خطأ في تحميل التفاصيل:', err);
      showToast('❌ حدث خطأ في تحميل البيانات');
    }
  }

  function closeUserDetail() {
    document.getElementById('userDetailModal').classList.remove('open');
  }

  // ===== دوال الصور (Lightbox) =====
  function openImageModal(imageSrc, title) {
    if (!imageSrc || imageSrc.includes('data:image/svg')) {
      showToast('❌ لا توجد صورة لهذا المستخدم');
      return;
    }
    document.getElementById('modalImage').src = imageSrc;
    document.getElementById('imageModalTitle').textContent = title;
    document.getElementById('imageModal').classList.add('open');
  }

  function closeImageModal() {
    document.getElementById('imageModal').classList.remove('open');
  }

  // إغلاق النافذة عند الضغط على خلفية سوداء
  document.getElementById('imageModal').addEventListener('click', function(e) {
    if (e.target === this) {
      closeImageModal();
    }
  });

  // ===== المحفوظات (سجل نشاط الأدمن) =====

  async function loadActivityLog() {
    document.getElementById('logLoading').style.display = 'block';
    document.getElementById('logList').innerHTML = '';
    document.getElementById('logEmpty').style.display = 'none';
    document.getElementById('logBulkBar').style.display = 'none';

    const data = await apiCall('/api/admin/activity-log');
    document.getElementById('logLoading').style.display = 'none';

    if (!data || !data.success) {
      showToast(data?.error || 'فشل تحميل السجل');
      return;
    }

    if (data.logs.length === 0) {
      document.getElementById('logEmpty').style.display = 'block';
      return;
    }

    const listEl = document.getElementById('logList');
    data.logs.forEach(log => {
      const d = new Date(log.created_at);
      const dateStr = d.toLocaleDateString('ar-DZ');
      const timeStr = d.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' });

      const row = document.createElement('div');
      row.className = 'log-row';
      row.innerHTML = `
        <input type="checkbox" class="log-check" value="${log.id}" onchange="updateLogSelection()">
        <div style="flex:1;">
          <div class="log-action">${escapeHtml(log.action)}</div>
          <div class="log-meta">بواسطة: ${escapeHtml(log.admin_name)} · معرّف العنصر: ${escapeHtml(String(log.target_id))}</div>
          ${log.note ? `<div class="log-note">${escapeHtml(log.note)}</div>` : ''}
        </div>
        <div class="log-time">${dateStr}<br>${timeStr}</div>
        <button class="log-delete-one" title="حذف هذا السجل" onclick="deleteOneLog(${log.id})">✕</button>
      `;
      listEl.appendChild(row);
    });
  }

  function updateLogSelection() {
    const checked = document.querySelectorAll('.log-check:checked');
    document.getElementById('logSelectedCount').textContent = checked.length;
    document.getElementById('logBulkBar').style.display = checked.length > 0 ? 'block' : 'none';
  }

  async function deleteOneLog(id) {
    if (!confirm('حذف هذا السجل من المحفوظات؟')) return;
    const data = await apiCall('/api/admin/activity-log', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] })
    });
    if (data && data.success) {
      showToast('تم الحذف');
      loadActivityLog();
    } else {
      showToast(data?.error || 'فشل الحذف');
    }
  }

  async function deleteSelectedLogs() {
    const ids = Array.from(document.querySelectorAll('.log-check:checked')).map(cb => parseInt(cb.value));
    if (ids.length === 0) return;
    if (!confirm(`حذف ${ids.length} سجل من المحفوظات نهائياً؟`)) return;

    const data = await apiCall('/api/admin/activity-log', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    if (data && data.success) {
      showToast(data.message || 'تم الحذف');
      loadActivityLog();
    } else {
      showToast(data?.error || 'فشل الحذف');
    }
  }

  // ===== حذف المنتجات المعتمدة =====

  let currentDeleteProductId = null;

  // متغير عام لحفظ المنتجات المعتمدة
  let allApprovedProducts = [];

  async function loadApprovedProducts() {
    document.getElementById('approvedProductsLoading').style.display = 'block';
    document.getElementById('approvedProductsList').innerHTML = '';
    document.getElementById('approvedProductsEmpty').style.display = 'none';

    // تحميل المنتجات المعتمدة
    const data = await apiCall('/api/admin/pending-products');

    document.getElementById('approvedProductsLoading').style.display = 'none';

    if (!data || !data.success) {
      console.log('تم تحميل المنتجات بنجاح لكن بدون بيانات');
      return;
    }

    // تصفية المنتجات المعتمدة فقط
    allApprovedProducts = (data.products || []).filter(p => p.approval_status === 'approved');

    if (allApprovedProducts.length === 0) {
      document.getElementById('approvedProductsEmpty').style.display = 'block';
      document.getElementById('approvedProductsSection').style.display = 'none';
      return;
    }

    document.getElementById('approvedProductsSection').style.display = 'block';
    document.getElementById('approvedCount').textContent = allApprovedProducts.length;

    renderApprovedProducts(allApprovedProducts);

    // إضافة حدث البحث
    document.getElementById('productsSearchInput').addEventListener('input', filterProducts);
  }

  function renderApprovedProducts(products) {
    const listEl = document.getElementById('approvedProductsList');
    listEl.innerHTML = '';

    if (products.length === 0) {
      document.getElementById('approvedProductsEmpty').style.display = 'block';
      return;
    }

    document.getElementById('approvedProductsEmpty').style.display = 'none';

    products.forEach(product => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.dataset.productId = product.id;

      const createdDate = new Date(product.created_at).toLocaleDateString('ar-DZ');

      card.innerHTML = `
        <input type="checkbox" class="product-card-checkbox product-checkbox" data-id="${product.id}" onchange="updateDeleteButtonVisibility()">
        <div class="product-card-info">
          <div class="product-card-name">${escapeHtml(product.name)}</div>
          <div class="product-card-meta">
            🏬 ${escapeHtml(product.store_name || 'غير محدد')} · 👤 ${escapeHtml(product.full_name || 'غير محدد')}
          </div>
          <div class="product-card-meta">
            📅 ${createdDate} · 🔖 ${escapeHtml(product.oem_number || 'بدون OEM')}
          </div>
          ${product.description ? `<div class="product-card-meta">📝 ${escapeHtml(product.description.substring(0, 80))}</div>` : ''}
          <div class="product-card-status">✓ معتمد</div>
        </div>
        <div class="product-card-actions">
          <button class="btn-delete-product" onclick="openDeleteProductModal('${product.id}', '${escapeHtml(product.name)}')">
            🗑️ حذف
          </button>
        </div>
      `;

      // إضافة حدث الـ checkbox للتلوين
      const checkbox = card.querySelector('.product-checkbox');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          card.classList.add('selected');
        } else {
          card.classList.remove('selected');
        }
        updateDeleteButtonVisibility();
      });

      listEl.appendChild(card);
    });
  }

  function filterProducts() {
    const searchText = document.getElementById('productsSearchInput').value.toLowerCase().trim();
    
    if (!searchText) {
      renderApprovedProducts(allApprovedProducts);
      return;
    }

    const filtered = allApprovedProducts.filter(p => 
      p.name.toLowerCase().includes(searchText) ||
      (p.oem_number && p.oem_number.toLowerCase().includes(searchText)) ||
      (p.store_name && p.store_name.toLowerCase().includes(searchText)) ||
      (p.full_name && p.full_name.toLowerCase().includes(searchText))
    );

    renderApprovedProducts(filtered);
  }

  function updateDeleteButtonVisibility() {
    const selectedCheckboxes = document.querySelectorAll('.product-checkbox:checked');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const selectedCount = document.getElementById('selectedCount');

    selectedCount.textContent = selectedCheckboxes.length;

    if (selectedCheckboxes.length > 0) {
      deleteBtn.style.display = 'block';
    } else {
      deleteBtn.style.display = 'none';
    }
  }

  function prepareDeleteMultiple() {
    const selectedCheckboxes = document.querySelectorAll('.product-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
      showToast('❌ اختر منتج واحد على الأقل');
      return;
    }

    const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);
    const selectedNames = selectedIds.map(id => {
      const product = allApprovedProducts.find(p => p.id === id);
      return product ? escapeHtml(product.name) : 'غير معروف';
    });

    // فتح موديال حذف جماعي
    const reasonInput = prompt(
      `هل أنت متأكد من حذف ${selectedIds.length} منتج؟\n\n` +
      `المنتجات المختارة:\n${selectedNames.slice(0, 5).join('\n')}${selectedNames.length > 5 ? '\n...' : ''}\n\n` +
      `⚠️ أدخل سبب الحذف (إلزامي):`,
      ''
    );

    if (reasonInput === null) return; // ألغى المستخدم

    if (!reasonInput.trim()) {
      showToast('❌ يجب إدخال سبب الحذف');
      return;
    }

    if (!confirm(`⚠️ هذه العملية نهائية ولا يمكن التراجع عنها!\n\nهل أنت متأكد من حذف ${selectedIds.length} منتج؟`)) {
      return;
    }

    deleteMultipleProducts(selectedIds, reasonInput.trim());
  }

  async function deleteMultipleProducts(productIds, reason) {
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const originalText = deleteBtn.textContent;
    deleteBtn.disabled = true;
    deleteBtn.textContent = '⏳ جاري الحذف...';

    const data = await apiCall('/api/admin/delete-products-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds, reason })
    });

    deleteBtn.disabled = false;
    deleteBtn.textContent = originalText;

    if (data && data.success) {
      showToast(`✅ تم حذف ${data.deleted_count} منتج بنجاح`);
      loadApprovedProducts(); // إعادة تحميل
      document.getElementById('productsSearchInput').value = '';
    } else {
      showToast('❌ ' + (data?.error || 'فشل الحذف'));
    }
  }

  function openDeleteProductModal(productId, productName) {
    currentDeleteProductId = productId;
    document.getElementById('deleteProductName').textContent = productName;
    document.getElementById('deleteProductId').textContent = productId;
    document.getElementById('deleteReasonText').value = '';
    document.getElementById('deleteProductModal').classList.add('open');
    document.getElementById('deleteReasonText').focus();
  }

  function closeDeleteProductModal() {
    document.getElementById('deleteProductModal').classList.remove('open');
    currentDeleteProductId = null;
  }

  async function confirmDeleteProduct() {
    const reason = document.getElementById('deleteReasonText').value.trim();

    if (!reason) {
      showToast('يجب إدخال سبب الحذف');
      return;
    }

    if (!confirm('هل أنت متأكد تماماً؟ هذه العملية نهائية ولا يمكن التراجع عنها!')) {
      return;
    }

    // تعطيل الزر أثناء الحذف
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const originalText = confirmBtn.textContent;
    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ جاري الحذف...';

    const data = await apiCall('/api/admin/delete-product/' + currentDeleteProductId, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });

    confirmBtn.disabled = false;
    confirmBtn.textContent = originalText;

    if (data && data.success) {
      showToast('✅ تم حذف المنتج بنجاح');
      closeDeleteProductModal();
      loadApprovedProducts(); // إعادة تحميل القائمة
    } else {
      showToast('❌ ' + (data?.error || 'فشل الحذف'));
    }
  }

  // ربط أزرار الموديل
  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('deleteProductModal');
    
    document.getElementById('confirmDeleteBtn').onclick = confirmDeleteProduct;
    document.getElementById('cancelDeleteBtn').onclick = closeDeleteProductModal;

    // إغلاق الموديل عند الضغط خارجه
    modal.onclick = (e) => {
      if (e.target === modal) closeDeleteProductModal();
    };

    // إغلاق الموديل بـ Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        closeDeleteProductModal();
      }
    });
  });

  // تحميل أولي
  loadSupplierRequests();
  loadApprovedProducts();
