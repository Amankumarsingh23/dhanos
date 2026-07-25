-- PROMPT 45 — security review finding: the `documents` and `avatars`
-- Storage buckets had no server-side file_size_limit/allowed_mime_types,
-- so the app's client-side caps (MAX_DOCUMENT_SIZE_BYTES = 25 MB,
-- src/lib/validation/documents.ts; MAX_AVATAR_SIZE_BYTES = 2 MB,
-- src/lib/validation/settings.ts) were the *only* guard — trivially
-- bypassed by any caller that talks to the Storage API directly instead
-- of through the app's upload widget (confirmed live in
-- tests/e2e/security-review.spec.ts's "oversized file upload" test before
-- this migration). RLS on storage.objects already prevents a caller from
-- uploading into a household that isn't theirs; this closes the separate
-- "how big / what kind of file" gap, enforced by the Storage service
-- itself rather than trusted client-side JS.

update storage.buckets
set file_size_limit = 26214400, -- 25 MiB, matches MAX_DOCUMENT_SIZE_BYTES
    allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain'
    ]
where id = 'documents';

update storage.buckets
set file_size_limit = 2097152, -- 2 MiB, matches MAX_AVATAR_SIZE_BYTES
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'avatars';
