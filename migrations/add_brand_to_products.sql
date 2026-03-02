-- Migration: Add brand column to products table
-- Run this in Supabase SQL Editor

ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;

CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);

-- Update comment
COMMENT ON COLUMN products.brand IS 'Product brand name, separate from product name for better organization';
