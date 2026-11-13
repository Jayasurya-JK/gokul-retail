-- Schema v15: job work (aravai for a customer) is posted when it is entered. Additive only.
ALTER TABLE mill_cust_jobs ADD COLUMN posted INTEGER NOT NULL DEFAULT 0;
