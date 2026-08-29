  const API_BASE = window.location.origin;

  // إذا كانت هناك جلسة صالحة بالفعل، انتقل مباشرة للوحة
  if (localStorage.getItem('admin_token')) {
    window.location.href = 'admin-dashboard.html';
  }

  function showMsg(text) {
    const el = document.getElementById('msg');
    el.textContent = text;
    el.className = 'msg error';
  }

  async function login() {
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value;

    if (!username || !password) {
      showMsg('الرجاء إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.textContent = 'جارٍ الدخول...';

    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('admin_token', data.token);
        localStorage.setItem('admin_role', data.role);
        localStorage.setItem('admin_name', data.full_name);
        window.location.href = 'admin-dashboard.html';
      } else {
        showMsg(data.error || 'حدث خطأ');
      }
    } catch (err) {
      showMsg('خطأ في الاتصال: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'تسجيل الدخول';
    }
  }

  document.getElementById('passwordInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
  });
