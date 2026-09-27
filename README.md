# Parts Marketplace — سوق قطع غيار السيارات

منصة عربية لبيع قطع غيار السيارات في الجزائر — مشترون، موردون، وإدارة.

## البنية

```
backend/
  src/
    config/       إعدادات البيئة، قاعدة البيانات، السجلات
    middleware/    المصادقة، الصلاحيات، رفع الملفات، معالجة الأخطاء
    controllers/   منطق كل ميزة (مصادقة، كتالوج، موردين، طلبات، إدارة، SMS)
    services/      دوال مساعدة مشتركة (OTP، الجلسات، سجل النشاط)
    routes/        تعريف مسارات الـ API
    server.js       نقطة الدخول
  schema.sql        مخطط قاعدة البيانات الكامل (شغّله مرة واحدة على Supabase)
  .env.example      متغيرات البيئة المطلوبة
frontend/            11 صفحة HTML مستقلة (CSS/JS مضمّنة داخل كل صفحة)
infrastructure/
  Dockerfile          صورة خدمة واحدة (Node + الواجهة الثابتة معًا)
```

## الإعداد المحلي

```bash
cd backend
cp .env.example .env   # واملأ القيم الحقيقية
npm install
node src/server.js
```

السيرفر يخدم الـ API على `/api/*` والواجهة الثابتة من `/`.

## قاعدة البيانات

1. أنشئ مشروع Supabase جديد (أو استخدم الحالي).
2. في SQL Editor، شغّل محتوى `backend/schema.sql` بالكامل.
3. أنشئ Storage Buckets:
   - `supplier-documents` (خاص)
   - `product-images` (عام)
4. أنشئ أول حساب أدمن يدويًا (التعليمات في آخر `schema.sql`).

## النشر على Northflank

1. ادفع هذا المستودع لـ GitHub.
2. في Northflank: New Service → Deploy from Git → اختر المستودع.
3. Build type: Dockerfile → المسار: `infrastructure/Dockerfile`.
4. أضف متغيرات البيئة (نفس `.env.example`).
5. فعّل Public networking وحدد المنفذ `3000`.
6. اربط الدومين المخصص من إعدادات الخدمة (DNS → CNAME نحو Northflank).

## بوابة SMS

تطبيق أندرويد منفصل (Sketchware Pro) يستطلع `/sms/pending` كل 5 ثوانٍ، يرسل الرسالة عبر `SmsManager`، ويؤكد عبر `/sms/confirm`. كلا المسارين محميان بترويسة `x-gateway-secret` يجب أن تطابق `SMS_GATEWAY_SECRET`.

## ملاحظات مهمة

- جلسات المستخدمين والأدمن Token عشوائي (وليس JWT)، محفوظة في `user_sessions` / `admin_sessions`.
- صلاحيات الموظفين (`staff`) دقيقة عبر جدول `staff_permissions`؛ حساب `admin` الرئيسي يتجاوزها كلها.
- سجل النشاط (`admin_activity_log`) وحذف/عرض السجل مقصور على `role = 'admin'` فقط، وليس الموظفين.
