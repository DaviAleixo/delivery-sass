-- Corrige e-mail malformado sem TLD (.com) em auth.users que provocava HTTP 500 no GoTrue
UPDATE auth.users
SET email = 'aindanaosei@gmail.com',
    raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{email}', '"aindanaosei@gmail.com"')
WHERE id = 'eb600bb7-7c15-43c2-86f6-bea6909fd0e8'
  AND email = 'aindanaosei@gmail';
