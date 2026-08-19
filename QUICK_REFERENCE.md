# مرجع سريع - أماكن التغييرات الدقيقة

## 🔍 أين تجد التغييرات؟

### في `index.js`:

#### التغيير 1: السطر ~581
```javascript
// البحث عن: product.offers = null;
// استبدل بـ:
product.offers = []; // مصفوفة فارغة
```
**الموقع:** في دالة `app.get('/api/catalog/:id')`، في قسم الزوار غير المسجلين

#### التغيير 2: بعد السطر ~605 (بعد إغلاق دالة `/api/catalog/:id`)
```javascript
// أضف إندبوينت جديد كامل:

// ============ إندبوينت حماية: جلب البائعين ============
app.get('/api/product-suppliers/:productId', checkUserAuth, async (req, res) => {
  // ... الكود كاملاً (انظر الملف الجديد)
});
```

---

### في `product.html`:

#### التغيير 1: بعد السطر ~496 (بعد دالة `initials()`)
```javascript
// أضف دالة جماية جديدة:

function validateUserAccess(product) {
  if (product.login_required === true) {
    product.offers = [];
    return true;
  }
  return false;
}
```

#### التغيير 2: في دالة `loadProduct()` حول السطر ~517
```javascript
// ابحث عن:
currentProduct = data.product;
render(currentProduct);

// استبدل بـ:
currentProduct = data.product;

// 🔐 تطبيق فحص الحماية
validateUserAccess(currentProduct);

render(currentProduct);
```

#### التغيير 3: في دالة `render()` حول السطر ~586
```javascript
// ابحث عن:
if(p.login_required){
  buyBtn.textContent = 'سجّل الدخول لعرض البائعين';
  buyBtn.onclick = () => window.location.href = `/login.html...`;
}

// استبدل بـ:
if(p.login_required){
  // للزوار غير المسجلين: عطّل الزر تماماً
  buyBtn.textContent = 'سجّل الدخول لعرض البائعين';
  buyBtn.disabled = true;  // ← أضف هذا السطر!
  buyBtn.onclick = () => {
    window.location.href = `/login.html...`;
  };
}
```

#### التغيير 4: في دالة `openSellersSheet()` حول السطر ~599
```javascript
// استبدل جزء البداية بالكامل بـ:

function openSellersSheet(){
  // 🔐 فحص الحماية المستوى الأول
  const userToken = localStorage.getItem('user_token');
  const userProfile = JSON.parse(localStorage.getItem('user_profile') || 'null');
  
  if (!userToken || !userProfile) {
    console.warn('❌ محاولة عرض البائعين بدون تسجيل دخول');
    window.location.href = `/login.html?redirect=/product.html?id=${currentProduct.id}`;
    return;
  }

  // 🔐 فحص الحماية المستوى الثاني
  if (currentProduct.login_required === true) {
    console.warn('❌ محاولة عرض بائعين محظورين');
    window.location.href = `/login.html?redirect=/product.html?id=${currentProduct.id}`;
    return;
  }

  // 🔐 فحص الحماية المستوى الثالث
  const offers = currentProduct.offers;
  if (!Array.isArray(offers) || offers.length === 0) {
    console.warn('❌ لا توجد بائعون');
    alert('لا يوجد بائعون متوفرون حالياً لهذه القطعة');
    return;
  }

  const list = document.getElementById('sellerList');
  // ... بقية الكود الأصلي
```

---

## ✅ خطوات التحديث

### الطريقة 1: نسخ الملفات الكاملة
```bash
# انسخ الملفات الجديدة:
- index.js (الملف كاملاً)
- product.html (الملف كاملاً)

# ثم قم بـ:
git add .
git commit -m "🔐 أمان: إخفاء البائعين عن الزوار"
git push
```

### الطريقة 2: تعديل يدوي (إذا كان لديك تغييرات أخرى)
1. افتح `index.js`
2. ابحث عن السطور المذكورة أعلاه
3. طبق التغييرات بحذر
4. اختبر التغييرات محلياً

---

## 🧪 اختبار التغييرات

```bash
# 1. ادخل إلى المجلد
cd parts-marketplace

# 2. بدّل الملفات
git add index.js product.html

# 3. تحقق من التغييرات
git diff --cached

# 4. أرسل التحديثات
git commit -m "🔐 أمان: إخفاء البائعين عن الزوار"
git push

# 5. تحقق من Render Dashboard
# سيتم تحديث التطبيق تلقائياً خلال دقيقة أو اثنتين
```

---

## 📞 في حالة المشاكل

**إذا لم تعمل الحماية:**
1. افتح Developer Tools (F12)
2. انظر إلى Console
3. ابحث عن رسائل "❌"
4. تأكد من نسخ جميع الأسطر بالكامل

**إذا كان هناك خطأ في الـ Build:**
1. تحقق من `package.json` (يجب أن يحتوي على `"pg": "^8"`)
2. تحقق من متغيرات البيئة على Render
3. انظر إلى Render Dashboard → Logs

---

## 📊 ملخص سريع للتغييرات

| الملف | عدد الأسطر المضافة | عدد الأسطر المحذوفة |
|------|------------------|------------------|
| `index.js` | +42 (إندبوينت جديد) | 0 |
| `product.html` | +52 (فحوصات أمان) | 0 |

**المجموع:** ~94 سطر جديد للحماية 🔐

---

**تاريخ:** 2026-08-19  
**الأهمية:** ⚠️ حرجة - أمان البيانات
