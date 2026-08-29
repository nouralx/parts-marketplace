  <script>
    const API_BASE = 'https://parts-marketplace.onrender.com';

    // تبديل التابات
    function switchTab(name) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-button').forEach(el => el.classList.remove('active'));
      
      document.getElementById(name).classList.add('active');
      event.target.classList.add('active');

      if (name === 'listings') loadListings();
      if (name === 'orders') loadOrders();
      if (name === 'proposed') loadProposed();
    }

    // تحميل البيانات الأساسية
    async function loadSupplierData() {
      try {
        const token = localStorage.getItem('user_token');
        if (!token) {
          window.location.href = '/login.html';
          return;
        }

        const res = await fetch(`${API_BASE}/api/supplier/profile`, {
          headers: { 'x-user-token': token }
        });

        if (!res.ok) {
          window.location.href = '/login.html';
          return;
        }

        const data = await res.json();
        if (data.success) {
          updateSupplierInfo(data.supplier);
        }
      } catch (err) {
        console.error('خطأ:', err);
      }
    }

    function updateSupplierInfo(supplier) {
      document.getElementById('storeName').textContent = `متجر: ${supplier.store_name || '-'}`;
      document.getElementById('infoStoreName').textContent = supplier.store_name || '-';
      document.getElementById('infoWilaya').textContent = supplier.wilaya || '-';
      document.getElementById('infoNationalId').textContent = supplier.national_id || '-';
      document.getElementById('infoVerified').textContent = supplier.is_verified ? '✅ موثق' : '⏳ في انتظار التحقق';
    }

    // تحميل الإدراجات
    async function loadListings() {
      try {
        const token = localStorage.getItem('user_token');
        const res = await fetch(`${API_BASE}/api/supplier/listings`, {
          headers: { 'x-user-token': token }
        });

        const data = await res.json();
        if (data.success && data.listings.length > 0) {
          document.getElementById('listingsContainer').innerHTML = data.listings.map(l => `
            <div class="card">
              <div class="card-title">${l.product_name}</div>
              <div class="info-row">
                <span class="label">السعر:</span>
                <span class="value">${l.price} DA</span>
              </div>
              <div class="info-row">
                <span class="label">الحالة:</span>
                <span class="value">${l.is_available ? '✅ متاح' : '❌ غير متاح'}</span>
              </div>
              <div class="action-buttons">
                <button class="btn btn-secondary" onclick="alert('تحرير الإدراج')">تعديل</button>
                <button class="btn btn-secondary" onclick="alert('حذف الإدراج')">حذف</button>
              </div>
            </div>
          `).join('');
          document.getElementById('activeListings').textContent = data.listings.length;
        } else {
          document.getElementById('listingsContainer').innerHTML = '<div class="message">لا توجد إدراجات حالياً</div>';
        }
      } catch (err) {
        console.error('خطأ:', err);
      }
    }

    // تحميل الطلبات
    async function loadOrders() {
      try {
        const token = localStorage.getItem('user_token');
        const res = await fetch(`${API_BASE}/api/supplier/orders`, {
          headers: { 'x-user-token': token }
        });

        const data = await res.json();
        if (data.success && data.orders.length > 0) {
          document.getElementById('ordersContainer').innerHTML = data.orders.map(o => `
            <div class="card">
              <div class="card-title">طلب #${o.id.substring(0, 8)}</div>
              <div class="info-row">
                <span class="label">المنتج:</span>
                <span class="value">${o.product_name}</span>
              </div>
              <div class="info-row">
                <span class="label">الحالة:</span>
                <span class="value"><span class="badge badge-pending">${o.status}</span></span>
              </div>
              <div class="action-buttons">
                <button class="btn btn-primary">قبول</button>
                <button class="btn btn-secondary">رفض</button>
              </div>
            </div>
          `).join('');
          document.getElementById('ordersCount').textContent = data.orders.length;
        } else {
          document.getElementById('ordersContainer').innerHTML = '<div class="message">لا توجد طلبات حالياً</div>';
        }
      } catch (err) {
        console.error('خطأ:', err);
      }
    }

    // تحميل المقترحات
    async function loadProposed() {
      try {
        const token = localStorage.getItem('user_token');
        const res = await fetch(`${API_BASE}/api/supplier/proposed-products`, {
          headers: { 'x-user-token': token }
        });

        const data = await res.json();
        if (data.success && data.products.length > 0) {
          document.getElementById('proposedContainer').innerHTML = data.products.map(p => `
            <div class="card">
              <div class="card-title">${p.name}</div>
              <div class="info-row">
                <span class="label">الحالة:</span>
                <span class="badge ${p.approval_status === 'pending' ? 'badge-pending' : p.approval_status === 'approved' ? 'badge-approved' : 'badge-rejected'}">
                  ${p.approval_status === 'pending' ? '⏳ في الانتظار' : p.approval_status === 'approved' ? '✅ موافق عليه' : '❌ مرفوض'}
                </span>
              </div>
              ${p.rejection_reason ? `<div class="info-row"><span class="label">سبب الرفض:</span><span class="value">${p.rejection_reason}</span></div>` : ''}
            </div>
          `).join('');
          document.getElementById('proposedCount').textContent = data.products.length;
        } else {
          document.getElementById('proposedContainer').innerHTML = '<div class="message">لا توجد مقترحات حالياً</div>';
        }
      } catch (err) {
        console.error('خطأ:', err);
      }
    }

    function logout() {
      localStorage.removeItem('user_token');
      localStorage.removeItem('user_role');
      window.location.href = '/login.html';
    }

    // تحميل البيانات عند فتح الصفحة
    loadSupplierData();
  </script>
