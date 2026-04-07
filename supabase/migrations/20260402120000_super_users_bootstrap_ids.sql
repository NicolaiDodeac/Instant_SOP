-- Bootstrap super users (must already exist in auth.users).
insert into super_users (user_id) values
  ('788dad69-35d0-4814-9f27-d99ba6427b09'),
  ('62f18434-48a0-411c-9008-fde61da1047f'),
  ('e97b93ee-6940-4887-abbb-95dfc475a18e')
on conflict (user_id) do nothing;
