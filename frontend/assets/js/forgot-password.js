  const API_BASE = window.location.origin;
  const PURPOSE = 'password_reset';

  let currentLang = 'ar';
  let currentPhone = '';
  let currentOtp = '';
  let resendCooldown = 0;
  let resendInterval = null;

  const translations = {
    ar: {
      title: 'استعادة كلمة المرور',
      subtitle: 'أدخل رقم هاتفك المسجّل لإعادة تعيين كلمة المرور',
      phoneLabel: 'رقم الهاتف',
      sendBtn: 'إرسال رمز التحقق',
      otpLabel: 'رمز التحقق',
      verifyBtn: 'تحقق',
      resendText: 'لم يصلك الرمز؟',
      resendLink: 'إعادة الإرسال',
      newPasswordLabel: 'كلمة المرور الجديدة',
      passwordHint: '6 أحرف على الأقل',
      confirmPasswordLabel: 'تأكيد كلمة المرور',
      resetBtn: 'تغيير كلمة المرور',
      doneTitle: 'تم تغيير كلمة المرور بنجاح',
      goToLogin: 'اذهب لتسجيل الدخول',
      sending: 'جارٍ الإرسال...',
      verifying: 'جارٍ التحقق...',
      resetting: 'جارٍ التغيير...',
      otpSent: 'تم إرسال رمز التحقق إلى هاتفك',
      otpVerified: 'تم التحقق بنجاح!',
      errPhone: 'الرجاء إدخال رقم هاتف صحيح',
      errOtp: 'الرجاء إدخال رمز التحقق المكوّن من 6 أرقام',
      errPassword: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
      errConfirmPassword: 'كلمتا المرور غير متطابقتين',
      resendWait: 'يمكنك إعادة الإرسال بعد'
    },
    fr: {
      title: 'Récupération du mot de passe',
      subtitle: 'Entrez votre numéro pour réinitialiser votre mot de passe',
      phoneLabel: 'Numéro de téléphone',
      sendBtn: 'Envoyer le code',
      otpLabel: 'Code de vérification',
      verifyBtn: 'Vérifier',
      resendText: "Vous n'avez pas reçu le code ?",
      resendLink: 'Renvoyer',
      newPasswordLabel: 'Nouveau mot de passe',
      passwordHint: '6 caractères minimum',
      confirmPasswordLabel: 'Confirmer le mot de passe',
      resetBtn: 'Changer le mot de passe',
      doneTitle: 'Mot de passe changé avec succès',
      goToLogin: 'Aller à la connexion',
      sending: 'Envoi en cours...',
      verifying: 'Vérification en cours...',
      resetting: 'Changement en cours...',
      otpSent: 'Le code a été envoyé à votre téléphone',
      otpVerified: 'Vérifié avec succès !',
      errPhone: 'Veuillez entrer un numéro de téléphone valide',
      errOtp: 'Veuillez entrer le code à 6 chiffres',
      errPassword: 'Le mot de passe doit contenir au moins 6 caractères',
      errConfirmPassword: 'Les mots de passe ne correspondent pas',
      resendWait: 'Vous pourrez renvoyer le code dans'
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

  function normalizePhone(raw) {
    let p = raw.replace(/\s|-/g, '');
    if (p.startsWith('0')) {
      p = '213' + p.substring(1);
    }
    p = p.replace('+', '');
    return p;
  }

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

    // نتحقق فقط من صحة الرمز شكلياً هنا؛ التحقق الفعلي والاستهلاك يتم عبر /api/reset-password
    // نخزن الرمز لاستخدامه في الخطوة التالية دون استهلاكه هنا
    currentOtp = code;
    showMsg('msg2', t('otpVerified'), 'success');
    setTimeout(() => {
      document.getElementById('step2').classList.remove('active');
      document.getElementById('step3').classList.add('active');
    }, 600);

    btn.disabled = false;
    btn.innerHTML = `<span data-i18n="verifyBtn">${t('verifyBtn')}</span>`;
  }

  async function resetPassword() {
    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;

    if (!newPassword || newPassword.length < 6) {
      showMsg('msg3', t('errPassword'), 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showMsg('msg3', t('errConfirmPassword'), 'error');
      return;
    }

    const btn = document.getElementById('resetBtn');
    btn.disabled = true;
    btn.textContent = t('resetting');

    try {
      const res = await fetch(`${API_BASE}/api/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentPhone, otp_code: currentOtp, new_password: newPassword })
      });
      const data = await res.json();

      if (data.success) {
        document.getElementById('step3').classList.remove('active');
        document.getElementById('step4').classList.add('active');
      } else {
        showMsg('msg3', data.error || 'Error', 'error');
      }
    } catch (err) {
      showMsg('msg3', 'Network error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span data-i18n="resetBtn">${t('resetBtn')}</span>`;
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
