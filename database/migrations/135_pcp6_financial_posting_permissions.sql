BEGIN;

INSERT INTO permissions (permission_id, permission_code, permission_name, description)
VALUES
  ('permission-financial-posting-create', 'FINANCIAL_POSTING_CREATE', 'Create financial postings', 'Create and post balanced journal entries through the centralized financial posting service.'),
  ('permission-financial-posting-reverse', 'FINANCIAL_POSTING_REVERSE', 'Reverse financial postings', 'Create controlled reversing entries for posted financial transactions.')
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role-institution-administrator', permission_id
FROM permissions
WHERE permission_code IN ('FINANCIAL_POSTING_CREATE', 'FINANCIAL_POSTING_REVERSE')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role-treasury-officer', permission_id
FROM permissions
WHERE permission_code IN ('FINANCIAL_POSTING_CREATE', 'FINANCIAL_POSTING_REVERSE')
ON CONFLICT DO NOTHING;

COMMIT;
