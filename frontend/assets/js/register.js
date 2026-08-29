  const API_BASE = window.location.origin;
  const PURPOSE = 'registration';

  let currentLang = 'ar';
  let currentPhone = '';
  let selectedRole = '';
  let resendCooldown = 0;
  let resendInterval = null;
  let usernameCheckTimeout = null;
  let usernameIsAvailable = false;

  const translations = {
    ar: {
      title: 'إنشاء حساب جديد',
      phoneLabel: 'رقم الهاتف',
      sendBtn: 'إرسال رمز التحقق',
      otpLabel: 'رمز التحقق',
      verifyBtn: 'تحقق',
      resendText: 'لم يصلك الرمز؟',
      resendLink: 'إعادة الإرسال',
      nameLabel: 'الاسم الكامل',
      usernameLabel: 'اسم المستخدم',
      passwordLabel: 'كلمة المرور',
      passwordHint: '6 أحرف على الأقل',
      confirmPasswordLabel: 'تأكيد كلمة المرور',
      roleLabel: 'نوع الحساب',
      roleBuyer: 'مشترٍ',
      roleSupplier: 'مورّد',
      supplierInfoTitle: 'بيانات المتجر',
      storeNameLabel: 'اسم المتجر',
      wilayaLabel: 'الولاية',
      supplierDocsTitle: 'وثائق العضوية',
      crLabel: 'السجل التجاري',
      receiptLabel: 'إيصال دفع رسوم الاشتراك',
      fileHint: 'صورة أو PDF، بحد أقصى 5 ميغابايت',
      completeBtn: 'إنشاء الحساب',
      doneTitle: 'تم إنشاء حسابك بنجاح',
      goToLogin: 'اذهب لتسجيل الدخول',
      sending: 'جارٍ الإرسال...',
      verifying: 'جارٍ التحقق...',
      creating: 'جارٍ الإنشاء...',
      otpSent: 'تم إرسال رمز التحقق إلى هاتفك',
      otpVerified: 'تم التحقق بنجاح!',
      accountCreated: 'مرحباً بك في المنصة',
      pendingSupplierMsg: 'حسابك قيد المراجعة الآن. سنُخطرك فور الموافقة على وثائقك. يمكنك تسجيل الدخول بصلاحيات محدودة في الوقت الحالي.',
      errPhone: 'الرجاء إدخال رقم هاتف صحيح',
      errOtp: 'الرجاء إدخال رمز التحقق المكوّن من 6 أرقام',
      errName: 'الرجاء إدخال الاسم الكامل',
      errUsername: 'الرجاء إدخال اسم مستخدم صحيح (أحرف إنجليزية وأرقام فقط)',
      errUsernameTaken: 'اسم المستخدم هذا محجوز، اختر اسماً آخر',
      errPassword: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
      errConfirmPassword: 'كلمتا المرور غير متطابقتين',
      errRole: 'الرجاء اختيار نوع الحساب',
      errStoreName: 'الرجاء إدخال اسم المتجر',
      errWilaya: 'الرجاء اختيار الولاية',
      errCrFile: 'الرجاء رفع صورة أو ملف السجل التجاري',
      errReceiptFile: 'الرجاء رفع إيصال دفع رسوم الاشتراك',
      resendWait: 'يمكنك إعادة الإرسال بعد',
      checking: 'جارٍ التحقق...',
      usernameAvailable: '✓ اسم المستخدم متاح',
      usernameTaken: '✗ اسم المستخدم محجوز',
      passwordsMatch: '✓ متطابقتان',
      passwordsDontMatch: '✗ غير متطابقتين',
      alreadyRegisteredMsg: 'يوجد حساب مسجل بهذا الرقم مسبقاً.',
      loginHere: 'سجّل الدخول من هنا'
    },
    fr: {
      title: 'Créer un compte',
      phoneLabel: 'Numéro de téléphone',
      sendBtn: 'Envoyer le code',
      otpLabel: 'Code de vérification',
      verifyBtn: 'Vérifier',
      resendText: "Vous n'avez pas reçu le code ?",
      resendLink: 'Renvoyer',
      nameLabel: 'Nom complet',
      usernameLabel: "Nom d'utilisateur",
      passwordLabel: 'Mot de passe',
      passwordHint: '6 caractères minimum',
      confirmPasswordLabel: 'Confirmer le mot de passe',
      roleLabel: 'Type de compte',
      roleBuyer: 'Acheteur',
      roleSupplier: 'Fournisseur',
      supplierInfoTitle: 'Informations du magasin',
      storeNameLabel: 'Nom du magasin',
      wilayaLabel: 'Wilaya',
      supplierDocsTitle: "Documents d'adhésion",
      crLabel: 'Registre de commerce',
      receiptLabel: "Reçu de paiement de l'adhésion",
      fileHint: 'Image ou PDF, 5 Mo maximum',
      completeBtn: 'Créer le compte',
      doneTitle: 'Compte créé avec succès',
      goToLogin: 'Aller à la connexion',
      sending: 'Envoi en cours...',
      verifying: 'Vérification en cours...',
      creating: 'Création en cours...',
      otpSent: 'Le code a été envoyé à votre téléphone',
      otpVerified: 'Vérifié avec succès !',
      accountCreated: 'Bienvenue sur la plateforme',
      pendingSupplierMsg: 'Votre compte est en cours de vérification. Vous serez notifié dès l\'approbation de vos documents. Vous pouvez vous connecter avec des accès limités pour le moment.',
      errPhone: 'Veuillez entrer un numéro de téléphone valide',
      errOtp: 'Veuillez entrer le code à 6 chiffres',
      errName: 'Veuillez entrer votre nom complet',
      errUsername: "Nom d'utilisateur invalide (lettres et chiffres uniquement)",
      errUsernameTaken: "Ce nom d'utilisateur est déjà pris",
      errPassword: 'Le mot de passe doit contenir au moins 6 caractères',
      errConfirmPassword: 'Les mots de passe ne correspondent pas',
      errRole: 'Veuillez choisir le type de compte',
      errStoreName: 'Veuillez entrer le nom du magasin',
      errWilaya: 'Veuillez choisir la wilaya',
      errCrFile: 'Veuillez téléverser le registre de commerce',
      errReceiptFile: 'Veuillez téléverser le reçu de paiement',
      resendWait: 'Vous pourrez renvoyer le code dans',
      checking: 'Vérification...',
      usernameAvailable: '✓ Disponible',
      usernameTaken: '✗ Déjà pris',
      passwordsMatch: '✓ Identiques',
      passwordsDontMatch: '✗ Différents',
      alreadyRegisteredMsg: 'Un compte existe déjà avec ce numéro.',
      loginHere: 'Connectez-vous ici'
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

  function showMsgHtml(elId, html, type) {
    const el = document.getElementById(elId);
    el.innerHTML = html;
    el.className = 'msg ' + type;
  }

  function normalizePhone(raw) {
    let p = raw.replace(/\s|-/g, '');
    if (p.startsWith('0')) {
      p = '213' + p.substring(1);
    }
    p = p.replace('+', '');
    return p;
  }

  function selectRole(role) {
    selectedRole = role;
    document.getElementById('role-buyer').classList.toggle('selected', role === 'buyer');
    document.getElementById('role-supplier').classList.toggle('selected', role === 'supplier');
    document.getElementById('supplierSection').classList.toggle('active', role === 'supplier');
  }

  function checkUsername() {
    const username = document.getElementById('usernameInput').value.trim();
    const statusEl = document.getElementById('usernameStatus');
    usernameIsAvailable = false;

    clearTimeout(usernameCheckTimeout);

    if (!username || !/^[a-zA-Z0-9_]+$/.test(username)) {
      statusEl.textContent = username ? t('errUsername') : '';
      statusEl.className = 'field-status taken';
      return;
    }

    statusEl.textContent = t('checking');
    statusEl.className = 'field-status checking';

    usernameCheckTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/check-username?username=${encodeURIComponent(username)}`);
        const data = await res.json();
        if (data.available) {
          usernameIsAvailable = true;
          statusEl.textContent = t('usernameAvailable');
          statusEl.className = 'field-status ok';
        } else {
          usernameIsAvailable = false;
          statusEl.textContent = t('usernameTaken');
          statusEl.className = 'field-status taken';
        }
      } catch (err) {
        statusEl.textContent = '';
      }
    }, 500);
  }

  function checkPasswordMatch() {
    const password = document.getElementById('passwordInput').value;
    const confirm = document.getElementById('confirmPasswordInput').value;
    const statusEl = document.getElementById('confirmStatus');

    if (!confirm) {
      statusEl.textContent = '';
      return;
    }

    if (password === confirm) {
      statusEl.textContent = t('passwordsMatch');
      statusEl.className = 'field-status ok';
    } else {
      statusEl.textContent = t('passwordsDontMatch');
      statusEl.className = 'field-status taken';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('confirmPasswordInput').addEventListener('input', checkPasswordMatch);
    document.getElementById('passwordInput').addEventListener('input', checkPasswordMatch);
  });

  async function sendOtp() {
    const raw = document.getElementById('phoneInput').value.trim();
    if (!raw || raw.length < 8) {
      showMsg('msg1', t('errPhone'), 'error');
      return;
    }

    currentPhone = normalizePhone(raw);
    const btn = document.getElementById('sendBtn');
    btn.disabled = true;
    btn.textContent = t('sending');

    try {
      const res = await fetch(`${API_BASE}/api/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentPhone, purpose: PURPOSE })
      });
      const data = await res.json();

      if (data.success) {
        showMsg('msg1', t('otpSent'), 'success');
        setTimeout(() => {
          document.getElementById('step1').classList.remove('active');
          document.getElementById('step2').classList.add('active');
          startResendCooldown();
        }, 800);
      } else if (data.already_registered) {
        showMsgHtml('msg1', `${t('alreadyRegisteredMsg')} <a href="login.html">${t('loginHere')}</a>`, 'error');
      } else {
        showMsg('msg1', data.error || 'Error', 'error');
      }
    } catch (err) {
      showMsg('msg1', 'Network error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span data-i18n="sendBtn">${t('sendBtn')}</span>`;
    }
  }

  async function verifyOtp() {
    const code = document.getElementById('otpInput').value.trim();
    if (!code || code.length !== 6) {
      showMsg('msg2', t('errOtp'), 'error');
      return;
    }

    const btn = document.getElementById('verifyBtn');
    btn.disabled = true;
    btn.textContent = t('verifying');

    try {
      const res = await fetch(`${API_BASE}/api/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentPhone, otp_code: code })
      });
      const data = await res.json();

      if (data.success) {
        showMsg('msg2', t('otpVerified'), 'success');
        setTimeout(() => {
          document.getElementById('step2').classList.remove('active');
          document.getElementById('step3').classList.add('active');
        }, 600);
      } else {
        showMsg('msg2', data.error || 'Error', 'error');
      }
    } catch (err) {
      showMsg('msg2', 'Network error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span data-i18n="verifyBtn">${t('verifyBtn')}</span>`;
    }
  }

  async function completeRegistration() {
    const name = document.getElementById('nameInput').value.trim();
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;

    if (!name) {
      showMsg('msg3', t('errName'), 'error');
      return;
    }
    if (!username || !/^[a-zA-Z0-9_]+$/.test(username)) {
      showMsg('msg3', t('errUsername'), 'error');
      return;
    }
    if (!usernameIsAvailable) {
      showMsg('msg3', t('errUsernameTaken'), 'error');
      return;
    }
    if (!password || password.length < 6) {
      showMsg('msg3', t('errPassword'), 'error');
      return;
    }
    if (password !== confirmPassword) {
      showMsg('msg3', t('errConfirmPassword'), 'error');
      return;
    }
    if (!selectedRole) {
      showMsg('msg3', t('errRole'), 'error');
      return;
    }

    let storeName = '';
    let wilaya = '';
    let crFile = null;
    let receiptFile = null;

    if (selectedRole === 'supplier') {
      storeName = document.getElementById('storeNameInput').value.trim();
      wilaya = document.getElementById('wilayaInput').value;
      crFile = document.getElementById('crFile').files[0];
      receiptFile = document.getElementById('receiptFile').files[0];

      if (!storeName) {
        showMsg('msg3', t('errStoreName'), 'error');
        return;
      }
      if (!wilaya) {
        showMsg('msg3', t('errWilaya'), 'error');
        return;
      }
      if (!crFile) {
        showMsg('msg3', t('errCrFile'), 'error');
        return;
      }
      if (!receiptFile) {
        showMsg('msg3', t('errReceiptFile'), 'error');
        return;
      }
    }

    const btn = document.getElementById('completeBtn');
    btn.disabled = true;
    btn.textContent = t('creating');

    try {
      const formData = new FormData();
      formData.append('phone', currentPhone);
      formData.append('full_name', name);
      formData.append('role', selectedRole);
      formData.append('username', username);
      formData.append('password', password);

      if (selectedRole === 'supplier') {
        formData.append('store_name', storeName);
        formData.append('wilaya', wilaya);
        formData.append('commercial_register', crFile);
        formData.append('payment_receipt', receiptFile);
      }

      const res = await fetch(`${API_BASE}/api/complete-registration`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        document.getElementById('step3').classList.remove('active');
        document.getElementById('step4').classList.add('active');
        document.getElementById('msg4').textContent = t('accountCreated');

        if (data.verification_status === 'pending') {
          const pendingEl = document.getElementById('pendingMsg');
          pendingEl.style.display = 'block';
          pendingEl.textContent = t('pendingSupplierMsg');
        }
      } else {
        showMsg('msg3', data.error || 'Error', 'error');
      }
    } catch (err) {
      showMsg('msg3', 'Network error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span data-i18n="completeBtn">${t('completeBtn')}</span>`;
    }
  }

  function startResendCooldown() {
    resendCooldown = 60;
    const link = document.getElementById('resendLink');
    const timer = document.getElementById('resendTimer');
    link.classList.add('disabled');

    resendInterval = setInterval(() => {
      resendCooldown--;
      timer.textContent = ` (${t('resendWait')} ${resendCooldown}s)`;
      if (resendCooldown <= 0) {
        clearInterval(resendInterval);
        link.classList.remove('disabled');
        timer.textContent = '';
      }
    }, 1000);
  }

  async function resendOtp() {
    if (resendCooldown > 0) return;

    try {
      const res = await fetch(`${API_BASE}/api/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentPhone, purpose: PURPOSE })
      });
      const data = await res.json();

      if (data.success) {
        showMsg('msg2', t('otpSent'), 'success');
        startResendCooldown();
      } else {
        showMsg('msg2', data.error || 'Error', 'error');
      }
    } catch (err) {
      showMsg('msg2', 'Network error: ' + err.message, 'error');
    }
  }

  setLang('ar');
