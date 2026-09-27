-- ============================================================================
-- parts-marketplace — Database schema (AS-BUILT reference, not a fresh-install
-- script). This mirrors exactly what is already running in the project's
-- Supabase Postgres — introspected via information_schema because no schema
-- file existed anywhere in this project's history before now.
--
-- DO NOT run this against the existing project — the tables already exist
-- (with live data: profiles, products, orders, suppliers all populated).
-- This file exists so the schema is finally version-controlled, and so a
-- *fresh* project (staging, disaster recovery) can be bootstrapped from it.
--
-- Also required in Supabase Storage (already created on the live project):
--   - "supplier-documents" (private)
--   - "product-images"     (public)
-- ============================================================================

CREATE TABLE profiles (
  id                    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role                  text NOT NULL CHECK (role IN ('buyer', 'supplier', 'admin', 'staff')),
  full_name             text,
  phone                 text,
  username              text,
  password_hash         text,
  is_phone_verified     boolean DEFAULT false,
  is_active             boolean DEFAULT true,
  verification_status   text NOT NULL DEFAULT 'approved',
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
-- NOTE: no `email` column exists on this table — the app never uses one.

CREATE TABLE otp_verifications (
  id            bigserial PRIMARY KEY,
  phone         text NOT NULL,
  otp_code      text NOT NULL,
  purpose       text NOT NULL DEFAULT 'registration',
  expires_at    timestamptz NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  is_verified   boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE sms_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL,
  message       text NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz DEFAULT now(),
  sent_at       timestamptz
);

CREATE TABLE suppliers (
  id                    bigserial PRIMARY KEY,
  user_id               uuid NOT NULL REFERENCES profiles(id),
  store_name            text NOT NULL,
  wilaya                text,
  address               text,
  bank_transfer_ref     text,
  subscription_status   text NOT NULL DEFAULT 'pending',
  subscription_start    date,
  subscription_end      date,
  penalty_points        integer NOT NULL DEFAULT 0,
  rating_avg            numeric DEFAULT 0.0,
  is_verified           boolean DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
-- NOTE: no `national_id` column — use address/bank_transfer_ref instead.

CREATE TABLE supplier_documents (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id                  uuid NOT NULL REFERENCES profiles(id),
  commercial_register_url     text NOT NULL,
  payment_receipt_url         text NOT NULL,
  status                      text NOT NULL DEFAULT 'pending',
  admin_note                  text,
  created_at                  timestamptz DEFAULT now(),
  reviewed_at                 timestamptz
);

CREATE TABLE vehicles_reference (
  id            bigserial PRIMARY KEY,
  make          text NOT NULL,
  model         text NOT NULL,
  year_start    integer NOT NULL,
  year_end      integer NOT NULL,
  body_type     text,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE products (
  id                          bigserial PRIMARY KEY,
  supplier_id                 bigint REFERENCES suppliers(id), -- legacy, unused by the current app
  proposed_by_supplier_id     bigint REFERENCES suppliers(id),
  name                        text NOT NULL,
  description                 text,
  oem_number                  text,
  category                    text,
  condition                   text NOT NULL DEFAULT 'new',
  is_active                   boolean DEFAULT true,
  approval_status             text NOT NULL DEFAULT 'pending',
  suggested_price             numeric, -- present in schema, not currently set by the app
  admin_note                  text,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

CREATE TABLE product_images (
  id            bigserial PRIMARY KEY,
  product_id    bigint NOT NULL REFERENCES products(id),
  image_url     text NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE product_vehicle_pricing (
  id                    bigserial PRIMARY KEY,
  product_id            bigint NOT NULL REFERENCES products(id),
  vehicle_id            bigint NOT NULL REFERENCES vehicles_reference(id),
  supplier_id           bigint NOT NULL REFERENCES suppliers(id),
  price                 numeric NOT NULL,
  quality_grade         text,
  brand                 text,
  country_of_origin     text,
  delivery_type         text DEFAULT 'shipping',
  is_available          boolean DEFAULT true,
  is_active             boolean DEFAULT true,
  approval_status       text NOT NULL DEFAULT 'pending',
  admin_note            text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE orders (
  id                    bigserial PRIMARY KEY,
  buyer_id              uuid NOT NULL REFERENCES profiles(id),
  status                text NOT NULL DEFAULT 'pending',
  total_amount          numeric NOT NULL DEFAULT 0,
  shipping_address      text NOT NULL,
  shipping_wilaya       text NOT NULL,
  phone_contact         text NOT NULL,
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE order_items (
  id            bigserial PRIMARY KEY,
  order_id      bigint NOT NULL REFERENCES orders(id),
  product_id    bigint NOT NULL REFERENCES products(id),
  pricing_id    bigint NOT NULL REFERENCES product_vehicle_pricing(id), -- NOT "pvp_id"
  supplier_id   bigint NOT NULL REFERENCES suppliers(id),
  quantity      integer NOT NULL,
  unit_price    numeric NOT NULL,
  item_status   text NOT NULL DEFAULT 'pending',
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE user_sessions (
  token         text PRIMARY KEY,
  profile_id    uuid NOT NULL REFERENCES profiles(id),
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE admin_sessions (
  token         text PRIMARY KEY,
  admin_id      uuid NOT NULL REFERENCES profiles(id),
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE staff_permissions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id                uuid NOT NULL REFERENCES profiles(id),
  can_review_suppliers    boolean NOT NULL DEFAULT false,
  can_manage_users        boolean NOT NULL DEFAULT false,
  can_manage_products     boolean NOT NULL DEFAULT false,
  can_delete_products     boolean DEFAULT false,
  can_manage_orders       boolean NOT NULL DEFAULT false,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE TABLE admin_activity_log (
  id            bigserial PRIMARY KEY,
  admin_id      uuid REFERENCES profiles(id),
  action        text NOT NULL,
  target_type   text,
  target_id     text,
  note          text,
  created_at    timestamptz DEFAULT now()
);

-- ============================================================================
-- The following three tables exist in the live database but have NO backend
-- code anywhere in this project (checked against the full original index.js
-- and the new rewrite) — they were scaffolded for features that were never
-- built. Kept here for reference; not wired into the API. Worth deciding
-- deliberately whether to build them (invoicing, supplier penalties, buyer
-- reviews) or drop them.
-- ============================================================================

CREATE TABLE invoices (
  id                bigserial PRIMARY KEY,
  order_id          bigint NOT NULL REFERENCES orders(id),
  invoice_number    text NOT NULL,
  buyer_id          uuid NOT NULL REFERENCES profiles(id),
  total_amount      numeric NOT NULL,
  status            text NOT NULL DEFAULT 'issued',
  pdf_url           text,
  issued_at         timestamptz DEFAULT now()
);

CREATE TABLE penalties (
  id                  bigserial PRIMARY KEY,
  supplier_id         bigint NOT NULL REFERENCES suppliers(id),
  reason              text NOT NULL,
  reason_category     text NOT NULL,
  points              integer NOT NULL,
  related_order_id    bigint REFERENCES orders(id),
  issued_by           uuid NOT NULL REFERENCES profiles(id),
  status              text NOT NULL DEFAULT 'active',
  created_at          timestamptz DEFAULT now()
);

CREATE TABLE reviews (
  id              bigserial PRIMARY KEY,
  order_item_id   bigint NOT NULL REFERENCES order_items(id),
  buyer_id        uuid NOT NULL REFERENCES profiles(id),
  supplier_id     bigint NOT NULL REFERENCES suppliers(id),
  rating          integer NOT NULL,
  comment         text,
  is_visible      boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);
