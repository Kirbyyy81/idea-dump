update public."DIM_modules"
set
  enabled = false,
  is_managed = false,
  path = '/settings/docs',
  description = 'API documentation now lives under Settings.'
where modules = 'api';
