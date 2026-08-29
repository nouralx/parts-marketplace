  const API_BASE = window.location.origin;
  let currentLang = 'ar';

  const translations = {
    ar: {
      title: 'تسجيل الدخول',
      usernameLabel: 'اسم المستخدم',
      passwordLabel: 'كلمة المرور',
      forgotLink: 'نسيت كلمة المرور؟',
      loginBtn: 'تسجيل الدخول',
      noAccountText: 'ليس لديك حساب؟',
      registerLink: 'أنشئ حساباً',
      loggingIn: 'جارٍ الدخول...',
      errFields: 'الرجاء إدخال اسم المستخدم وكلمة المرور',
      welcomeBack: 'مرحباً بعودتك',
      roleBuyer: 'حساب مشترٍ',
      roleSupplier: 'حساب مورّد',
      pendingStatus: 'حسابك قيد المراجعة حالياً. لن تتمكن من عرض منتجاتك أو استخدام كامل ميزات المورّد حتى تتم الموافقة على وثائقك من قِبل الإدارة.',
      rejectedStatus: 'للأسف، لم تتم الموافقة على وثائقك. الرجاء التواصل مع الدعم لمعرفة التفاصيل وإعادة رفع الوثائق الصحيحة.'
    },
    fr: {
      title: 'Connexion',
      usernameLabel: "Nom d'utilisateur",
      passwordLabel: 'Mot de passe',
      forgotLink: 'Mot de passe oublié ?',
      loginBtn: 'Se connecter',
      noAccountText: "Vous n'avez pas de compte ?",
      registerLink: 'Créer un compte',
      loggingIn: 'Connexion en cours...',
      errFields: "Veuillez entrer votre nom d'utilisateur et mot de passe",
      welcomeBack: 'Bon retour',
      roleBuyer: 'Compte Acheteur',
      roleSupplier: 'Compte Fournisseur',
      pendingStatus: "Votre compte est actuellement en cours de vérification. Vous ne pourrez pas afficher vos produits ni utiliser toutes les fonctionnalités fournisseur tant que vos documents n'auront pas été approuvés.",
      rejectedStatus: "Malheureusement, vos documents n'ont pas été approuvés. Veuillez contacter le support pour plus de détails et soumettre à nouveau les documents corrects."
    }
  };

  function setLang(lang) {
    currentLang = lang;
    document.getElementById('btn-ar').classList.toggle('active', lang === 'ar');
    document.getElementById('btn-fr').classList.toggle('active', lang === 'fr');
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[lang][key]) {
        el.textContent = translations[lang][key];
      }
    });
  }

  function t(key) {
    return translations[currentLang][key];
  }

  function showMsg(elId, text, type) {
    const el = document.getElementById(elId);
    el.textContent = text;
    el.className = 'msg ' + type;
  }

  async function login() {
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value;

    if (!username || !password) {
      showMsg('msg1', t('errFields'), 'error');
      return;
    }

    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.textContent = t('loggingIn');

    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success) {
        const profile = data.profile;
        document.getElementById('welcomeTitle').textContent = `${t('welcomeBack')}، ${profile.full_name}`;

        const badgeEl = document.getElementById('roleBadge');
        badgeEl.textContent = profile.role === 'buyer' ? t('roleBuyer') : t('roleSupplier');
        badgeEl.className = 'role-badge role-' + profile.role;

        const bannerEl = document.getElementById('statusBanner');
        const iconEl = document.getElementById('statusIcon');
        const textEl = document.getElementById('statusText');

        if (profile.role === 'supplier' && profile.verification_status === 'pending') {
          bannerEl.className = 'status-banner pending';
          iconEl.textContent = '⏳';
          textEl.textContent = t('pendingStatus');
        } else if (profile.role === 'supplier' && profile.verification_status === 'rejected') {
          bannerEl.className = 'status-banner rejected';
          iconEl.textContent = '⚠️';
          textEl.textContent = t('rejectedStatus');
        } else {
          bannerEl.className = 'status-banner';
        }

        document.getElementById('step1').classList.remove('active');
        document.getElementById('step2').classList.add('active');

        // حفظ الجلسة: نفس الاسم "user_token" مستعمل في كل صفحات الموقع (catalog.html, product.html...)
        localStorage.setItem('user_token', data.token);
        localStorage.setItem('user_profile', JSON.stringify(profile));

        // إعادة التوجيه: إما لصفحة "redirect" المطلوبة، أو للوجهة الافتراضية حسب نوع الحساب
        const redirectTo = new URLSearchParams(window.location.search).get('redirect');
        setTimeout(() => {
          if (redirectTo) {
            window.location.href = redirectTo;
          } else if (profile.role === 'supplier') {
            window.location.href = '/supplier-dashboard.html';
          } else if (profile.role === 'admin' || profile.role === 'staff') {
            window.location.href = '/admin-dashboard.html';
          } else {
            window.location.href = '/catalog.html';
          }
        }, 900);
      } else {
        showMsg('msg1', data.error || 'Error', 'error');
      }
    } catch (err) {
      showMsg('msg1', 'Network error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span data-i18n="loginBtn">${t('loginBtn')}</span>`;
    }
  }

  setLang('ar');
