-- ============================================================================
-- parts-marketplace — Database schema
-- Run this once against your Supabase project's Postgres (SQL Editor, or
-- `psql $DATABASE_URL -f schema.sql`). This did not previously exist as a
-- file anywhere in the project's history — reconstructed from every query
-- in the backend so the schema is version-controlled going forward.
--
-- Requires: Supabase project (for `auth.users`, used by profiles.id FK).
-- Also create two Storage buckets in the Supabase dashboard:
--   - "supplier-documents" (private)
--   - "product-images"     (public)
-- ============================================================================

-- ---------- profiles ----------
-- One row per person (buyer, supplier, staff, or the main admin).
-- id mirrors auth.users.id (created via supabaseAdmin.auth.admin.createUser).
CREATE TABLE profiles (
  id                    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role                  text NOT NULL CHECK (role IN ('buyer', 'supplier', 'admin', 'staff')),
  full_name             text NOT NULL,
  phone                 text UNIQUE NOT NULL,
  username              text UNIQUE NOT NULL,
  password_hash         text NOT NULL,
  email                 text,
  is_phone_verified     boolean NOT NULL DEFAULT false,
  is_active             boolean NOT NULL DEFAULT true,
  verification_status   text NOT NULL DEFAULT 'approved' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_phone ON profiles(phone);

-- ---------- otp_verifications ----------
CREATE TABLE otp_verifications (
  id            bigserial PRIMARY KEY,
  phone         text NOT NULL,
  otp_code      text NOT NULL,
  purpose       text NOT NULL CHECK (purpose IN ('registration', 'login', 'password_reset')),
  is_verified   boolean NOT NULL DEFAULT false,
  attempts      integer NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_phone_created ON otp_verifications(phone, created_at DESC);

-- ---------- sms_queue ----------
-- The Android bridge app polls this table and sends via SmsManager.
CREATE TABLE sms_queue (
  id            bigserial PRIMARY KEY,
  phone         text NOT NULL,
  message       text NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz
);
CREATE INDEX idx_sms_queue_status ON sms_queue(status, created_at);

-- ---------- suppliers ----------
-- One row per supplier account, separate from profiles because
-- product_vehicle_pricing / products reference suppliers.id, not profiles.id.
CREATE TABLE suppliers (
  id                    bigserial PRIMARY KEY,
  user_id               uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  store_name            text NOT NULL,
  wilaya                text,
  national_id           text,
  is_verified           boolean NOT NULL DEFAULT false,
  subscription_status   text NOT NULL DEFAULT 'pending' CHECK (subscription_status IN ('pending', 'active', 'expired')),
  subscription_start    date,
  subscription_end      date,
  penalty_points         integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------- supplier_documents ----------
-- Commercial register + payment receipt uploaded at registration, reviewed by admin.
CREATE TABLE supplier_documents (
  id                          bigserial PRIMARY KEY,
  profile_id                  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  commercial_register_url     text NOT NULL,
  payment_receipt_url         text NOT NULL,
  status                      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note                  text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  reviewed_at                 timestamptz
);
CREATE INDEX idx_supplier_documents_status ON supplier_documents(status);

-- ---------- vehicles_reference ----------
-- Shared vehicle list (make/model/year range) used to scope pricing.
CREATE TABLE vehicles_reference (
  id            bigserial PRIMARY KEY,
  make          text NOT NULL,
  model         text NOT NULL,
  year_start    integer NOT NULL,
  year_end      integer NOT NULL,
  body_type     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicles_make_model ON vehicles_reference(make, model);

-- ---------- products ----------
-- Shared catalog entry (name/OEM/images), visible to everyone once approved.
-- Per-supplier price/availability lives in product_vehicle_pricing.
CREATE TABLE products (
  id                          bigserial PRIMARY KEY,
  proposed_by_supplier_id     bigint REFERENCES suppliers(id) ON DELETE SET NULL,
  name                        text NOT NULL,
  description                 text,
  oem_number                  text,
  category                    text,
  condition                   text NOT NULL DEFAULT 'new',
  is_active                   boolean NOT NULL DEFAULT true,
  approval_status             text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  admin_note                  text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_approval ON products(approval_status);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_oem ON products(oem_number);

-- ---------- product_images ----------
CREATE TABLE product_images (
  id            bigserial PRIMARY KEY,
  product_id    bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url     text NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_product_images_product ON product_images(product_id, sort_order);

-- ---------- product_vehicle_pricing ----------
-- A single supplier's listing/offer for one product on one vehicle.
CREATE TABLE product_vehicle_pricing (
  id                    bigserial PRIMARY KEY,
  product_id            bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  vehicle_id            bigint NOT NULL REFERENCES vehicles_reference(id) ON DELETE CASCADE,
  supplier_id           bigint NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  price                 numeric(12, 2) NOT NULL CHECK (price > 0),
  quality_grade         text,
  brand                 text,
  country_of_origin     text,
  delivery_type         text NOT NULL DEFAULT 'shipping',
  is_available          boolean NOT NULL DEFAULT true,
  is_active             boolean NOT NULL DEFAULT true,
  approval_status       text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  admin_note            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pvp_product ON product_vehicle_pricing(product_id);
CREATE INDEX idx_pvp_supplier ON product_vehicle_pricing(supplier_id);
CREATE INDEX idx_pvp_approval ON product_vehicle_pricing(approval_status);

-- ---------- orders ----------
CREATE TABLE orders (
  id                    bigserial PRIMARY KEY,
  buyer_id              uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'pending',
  total_amount          numeric(12, 2) NOT NULL,
  shipping_address      text NOT NULL,
  shipping_wilaya       text NOT NULL,
  phone_contact         text NOT NULL,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_buyer ON orders(buyer_id);

-- ---------- order_items ----------
-- One row per (supplier, product) within an order — lets each supplier
-- manage only their own slice of a multi-supplier order.
CREATE TABLE order_items (
  id            bigserial PRIMARY KEY,
  order_id      bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    bigint NOT NULL REFERENCES products(id),
  pvp_id        bigint REFERENCES product_vehicle_pricing(id) ON DELETE SET NULL,
  supplier_id   bigint NOT NULL REFERENCES suppliers(id),
  quantity      integer NOT NULL CHECK (quantity > 0),
  unit_price    numeric(12, 2) NOT NULL,
  item_status   text NOT NULL DEFAULT 'pending' CHECK (item_status IN ('pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_supplier ON order_items(supplier_id);

-- ---------- user_sessions / admin_sessions ----------
-- Plain bearer tokens (not JWT) sent back as x-user-token / x-admin-token.
CREATE TABLE user_sessions (
  token         text PRIMARY KEY,
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_sessions_profile ON user_sessions(profile_id);

CREATE TABLE admin_sessions (
  token         text PRIMARY KEY,
  admin_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_sessions_admin ON admin_sessions(admin_id);

-- ---------- staff_permissions ----------
-- Fine-grained permissions for role='staff' accounts. The main 'admin'
-- role bypasses this table entirely (see middleware/auth.js).
CREATE TABLE staff_permissions (
  staff_id                uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  can_review_suppliers    boolean NOT NULL DEFAULT false,
  can_manage_users        boolean NOT NULL DEFAULT false,
  can_manage_products     boolean NOT NULL DEFAULT false,
  can_delete_products     boolean NOT NULL DEFAULT false,
  can_manage_orders       boolean NOT NULL DEFAULT false
);

-- ---------- admin_activity_log ----------
CREATE TABLE admin_activity_log (
  id            bigserial PRIMARY KEY,
  admin_id      uuid NOT NULL REFERENCES profiles(id),
  action        text NOT NULL,
  target_type   text,
  target_id     text,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_log_created ON admin_activity_log(created_at DESC);

-- ============================================================================
-- Row Level Security: locked down for anon/authenticated Supabase clients.
-- The backend talks to Postgres with the service role key (or a direct
-- connection string), which bypasses RLS — these policies only matter if
-- someone points a public Supabase client at these tables directly.
-- ============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_vehicle_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;
-- No policies are defined, so with RLS enabled and no service-role bypass,
-- every table denies all access by default — exactly what we want here.

-- ============================================================================
-- Seed: create the first main admin account manually after running this file.
-- 1. In Supabase Auth, create a user (or use auth.admin.createUser).
-- 2. INSERT INTO profiles (id, role, full_name, phone, username, password_hash, verification_status)
--    VALUES ('<auth-user-uuid>', 'admin', 'المدير العام', '000000000', 'admin', '<bcrypt-hash>', 'approved');
-- ============================================================================
