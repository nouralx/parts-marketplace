const API_BASE = '';
const userToken = localStorage.getItem('user_token');
const userProfile = JSON.parse(localStorage.getItem('user_profile') || 'null');

if(!userToken || !userProfile || userProfile.role !== 'buyer'){
  window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

const orderStatusLabels = {
  pending: 'قيد الانتظار', confirmed: 'مؤكَّد', preparing: 'قيد التجهيز',
  shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي'
};
const itemStatusLabels = {
  pending: 'بانتظار المورّد', confirmed: 'مؤكَّد', preparing: 'قيد التجهيز',
  shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي'
};

async function loadOrders(){
  const content = document.getElementById('content');
  try{
    const res = await fetch(`${API_BASE}/api/buyer/orders`, { headers: { 'x-user-token': userToken } });
    const data = await res.json();

    if(!data.success){
      content.innerHTML = `<div class="empty"><h3>تعذّر التحميل</h3><p>${escapeHtml(data.error || '')}</p></div>`;
      return;
    }

    if(!data.orders.length){
      content.innerHTML = `<div class="empty">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        <h3>ما عندكش أي طلب بعد</h3>
        <p>تصفّح الكتالوج واطلب أول قطعة غيار تحتاجها</p>
        <a href="/catalog.html">تصفّح الكتالوج</a>
      </div>`;
      return;
    }

    content.innerHTML = data.orders.map(order => {
      const d = new Date(order.created_at);
      const dateStr = d.toLocaleDateString('ar-DZ') + ' · ' + d.toLocaleTimeString('ar-DZ', { hour:'2-digit', minute:'2-digit' });

      const itemsHtml = (order.items || []).map(item => `
        <div class="order-item-row">
          <div>
            <div class="item-name">${escapeHtml(item.product_name)}</div>
            <div class="item-meta">${escapeHtml(item.store_name)} · الكمية: ${item.quantity} · <span class="status-pill ${item.item_status}" style="margin-top:0;">${itemStatusLabels[item.item_status] || item.item_status}</span></div>
          </div>
          <div class="item-price">${parseFloat(item.unit_price).toLocaleString('ar-DZ')} دج</div>
        </div>
      `).join('');

      return `<div class="order-card">
        <div class="order-top">
          <div>
            <div class="order-id">طلب #${order.id}</div>
            <div class="order-date">${dateStr}</div>
            <span class="status-pill ${order.status}">${orderStatusLabels[order.status] || order.status}</span>
          </div>
          <div class="order-total">${parseFloat(order.total_amount).toLocaleString('ar-DZ')} دج</div>
        </div>
        ${itemsHtml}
        <div class="order-ship">
          📍 ${escapeHtml(order.shipping_address)}، ${escapeHtml(order.shipping_wilaya)}<br>
          📞 ${escapeHtml(order.phone_contact)}
          ${order.notes ? `<br>📝 ${escapeHtml(order.notes)}` : ''}
        </div>
      </div>`;
    }).join('');

  }catch(err){
    content.innerHTML = `<div class="empty"><h3>لا يوجد اتصال</h3><p>تأكد من الشبكة وحاول مجدداً</p></div>`;
  }
}

loadOrders();
