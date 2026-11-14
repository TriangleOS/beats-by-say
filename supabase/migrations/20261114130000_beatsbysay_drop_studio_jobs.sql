-- The studio engine moved to a free Hugging Face Space, so the per-artist job log for the paid Suno
-- integration (20261114120000_beatsbysay_studio_jobs.sql) is no longer used. It held no rows.
-- Safe to run twice.
drop table if exists public.beatsbysay_studio_jobs;
