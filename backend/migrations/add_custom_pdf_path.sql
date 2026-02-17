-- Migration: Add custom_pdf_path column to document_recipients table
-- Purpose: Store personalized PDF paths for CSV bulk send with personalized data
-- Date: 2025-12-10

ALTER TABLE document_recipients
ADD COLUMN custom_pdf_path VARCHAR(500) NULL AFTER token;
