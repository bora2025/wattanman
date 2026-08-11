# HTTP Size Limits

The API disables Nest/Express's implicit body parser and registers one explicit
JSON and URL-encoded parser before routes. `API_REQUEST_MAX_BYTES` defaults to
1 MiB and must be an integer of at least 1 KiB. Oversized bodies receive `413`
before controller execution.

Serialized JSON responses are measured before transmission.
`API_RESPONSE_MAX_BYTES` defaults to 10 MiB. Controllers that intentionally use
the raw Express response are responsible for an equivalent boundary; the image
proxy enforces `PROXY_IMAGE_MAX_BYTES` (5 MiB) using both `Content-Length` and
the downloaded buffer.

Multipart endpoints retain stricter endpoint-specific limits: extension ZIP,
invoice evidence, and payment QR uploads allow one file up to 5 MiB. Idempotent
response replay has its own smaller 256 KiB default because it is retained in
Redis.

Rollback restores the prior parser configuration and removes the response
interceptor. Raising limits should be a reviewed capacity change because every
replica may process that amount concurrently.
