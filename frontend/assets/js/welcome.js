  let currentLang = 'ar';

  const translations = {
    ar: {
      title: 'منصة قطع غيار السيارات',
      subtitle: 'اختر ما تريد القيام به',
      loginBtn: 'تسجيل الدخول',
      registerBtn: 'إنشاء حساب جديد'
    },
    fr: {
      title: 'Plateforme de pièces auto',
      subtitle: 'Que souhaitez-vous faire ?',
      loginBtn: 'Se connecter',
      registerBtn: 'Créer un compte'
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

  setLang('ar');
