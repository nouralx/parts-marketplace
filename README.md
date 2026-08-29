# 🏢 Parts Marketplace - منصة قطع الغيار المتقدمة

منصة احترافية لبيع وشراء قطع غيار السيارات في الجزائر. مبنية بأحدث التقنيات مع أفضل الممارسات الهندسية.

## 🚀 المميزات

### للمشترين (Buyers)
- ✅ تصفح وبحث متقدم عن القطع
- ✅ مقارنة الأسعار بين الموردين
- ✅ عرض الموقع الجغرافي للمورد
- ✅ إدارة الطلبات
- ✅ نظام التقييمات والتعليقات

### للموردين (Suppliers)
- ✅ لوحة تحكم شاملة
- ✅ إدارة الإدراجات والمخزون
- ✅ تتبع الطلبات الواردة
- ✅ إحصائيات مفصلة
- ✅ نظام المقترحات من الإدارة

### للإدارة (Admin)
- ✅ إدارة كاملة للمنتجات والموردين
- ✅ لوحة تحكم احترافية
- ✅ تقارير وإحصائيات
- ✅ إدارة المستخدمين
- ✅ نظام الموافقات والرفض

---

## 📊 التقنيات المستخدمة

### Frontend
- **HTML5** - هيكل الصفحات
- **CSS3** - التنسيقات المتقدمة
- **JavaScript (ES6+)** - الوظائفية التفاعلية

### Backend
- **Node.js** - بيئة التشغيل
- **Express.js** - إطار العمل
- **PostgreSQL** - قاعدة البيانات
- **Supabase** - تخزين الملفات

### DevOps & Infrastructure
- **Docker** - حاويات التطبيق
- **Docker Compose** - تنسيق الخدمات
- **Nginx** - خادم ويب عكسي
- **GitHub Actions** - أتمتة CI/CD

### أدوات التطوير
- **Git** - إدارة الإصدار
- **VS Code** - محرر الأكواد
- **Postman** - اختبار API
- **GitHub** - استضافة الأكواد

---

## 📁 هيكل المشروع

```
parts-marketplace/
├── frontend/                 # تطبيق الويب
│   ├── assets/               # ملفات ثابتة
│   │   ├── css/              # أنماط CSS
│   │   ├── js/               # JavaScript
│   │   └── images/           # صور
│   └── *.html                # صفحات HTML
│
├── backend/                  # خادم Express
│   ├── src/
│   │   ├── config/           # إعدادات
│   │   ├── routes/           # المسارات
│   │   ├── controllers/      # وحدات التحكم
│   │   ├── services/         # الخدمات
│   │   ├── middleware/       # الوسائط
│   │   └── utils/            # الأدوات
│   └── package.json          # المكتبات
│
├── infrastructure/           # البنية التحتية
│   ├── Dockerfile            # صورة Docker
│   ├── nginx.conf            # إعدادات Nginx
│   └── scripts/              # نصوص البدء
│
├── docs/                     # التوثيق
│   ├── api/                  # توثيق API
│   └── guides/               # أدلة الاستخدام
│
├── tests/                    # الاختبارات
│   ├── unit/                 # اختبارات الوحدات
│   ├── integration/          # اختبارات التكامل
│   └── e2e/                  # اختبارات الشاملة
│
└── .github/workflows/        # CI/CD Pipelines
```

---

## 🚀 البدء السريع

### المتطلبات
- Node.js 18+
- PostgreSQL 15+
- Docker و Docker Compose (اختياري)

### التثبيت المحلي

```bash
# 1. استنساخ المشروع
git clone https://github.com/yourusername/parts-marketplace.git
cd parts-marketplace

# 2. إعداد Backend
cd backend
cp .env.example .env
npm install

# 3. إعداد قاعدة البيانات
createdb parts_marketplace
# أو باستخدام Docker
docker run -d \
  --name parts-db \
  -e POSTGRES_DB=parts_marketplace \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:15-alpine

# 4. تشغيل الخادم
npm start
```

### التشغيل باستخدام Docker

```bash
# 1. إعداد البيئة
cp backend/.env.example .env

# 2. بناء وتشغيل الحاويات
docker-compose up -d

# 3. الاختبار
curl http://localhost:3000/health
```

---

## 📖 التوثيق

### API Documentation
- [توثيق Admin API](./docs/api/admin.md)
- [توثيق Supplier API](./docs/api/supplier.md)
- [توثيق Catalog API](./docs/api/catalog.md)
- [توثيق Auth API](./docs/api/auth.md)

### Guides
- [دليل التثبيت](./docs/guides/installation.md)
- [دليل النشر](./docs/guides/deployment.md)
- [دليل المعمارية](./docs/guides/architecture.md)

---

## 🔐 الأمان

- ✅ تشفير كلمات المرور (bcrypt)
- ✅ مصادقة JWT
- ✅ CORS وحماية CSRF
- ✅ Rate Limiting
- ✅ SQL Injection Prevention
- ✅ XSS Protection
- ✅ Security Headers

---

## 📊 الأداء

- ⚡ وقت الاستجابة < 200ms
- 🚀 Uptime > 99.9%
- 📈 دعم آلاف المستخدمين المتزامنين
- 💾 قاعدة بيانات محسّنة مع فهرسة

---

## 🛠️ المساهمة

نرحب بمساهماتك! يرجى:

1. Fork المشروع
2. إنشاء فرع للميزة (`git checkout -b feature/amazing-feature`)
3. Commit التغييرات (`git commit -m 'Add amazing feature'`)
4. Push إلى الفرع (`git push origin feature/amazing-feature`)
5. فتح Pull Request

---

## 📝 الترخيص

هذا المشروع مرخص تحت MIT License - انظر ملف [LICENSE](LICENSE) للتفاصيل.

---

## 📧 التواصل

- 📧 البريد الإلكتروني: info@parts-marketplace.com
- 📱 WhatsApp: +213 XXX XXX XXX
- 🌐 الموقع: https://parts-marketplace.com

---

## 🙏 شكر خاص

شكراً لجميع المساهمين والداعمين الذين ساعدوا في بناء هذا المشروع.

---

**جعل قطع الغيار في متناول الجميع! 🚗**

---

**Last Updated:** 27 August 2026  
**Version:** 1.0.0-professional
