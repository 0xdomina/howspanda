# How's U Operations Control

The platform feature switches are persisted in PostgreSQL. Environment values
seed a feature the first time it is created and remain the emergency/default
configuration for a fresh environment.

## Operator API

The private operations API requires a Medusa operations user session or bearer
token:

```http
GET /admin/features
PATCH /admin/features/malls
Content-Type: application/json

{"enabled":false}
```

The public storefront receives only safe booleans from `GET /store/features`.
When a feature is disabled, its frontend entry points disappear and guarded
backend routes return `404 Not found`, including direct API calls.

Current controls:

- `malls` — mall browsing, joining, creation, goods, purchases, and mall order completion
- `nin_verification` — ID verification and the courier KYC unlock

Product photos, banners, and product videos are core marketplace media and are
always available. They are protected by the upload validation and optimization
pipeline, not by an operations switch.

Payment rails use the existing `/admin/payment-rails/:key` runtime switch. For
the beta, keep `PAYSTACK_ENABLED=false` until live credentials are configured,
then enable the persisted `paystack` rail from Operations Control.

## Safe rollout

1. Apply the forward-only `platform_feature` migration to staging first.
2. Verify `/store/features` and the private admin endpoint with an operations user.
3. Toggle one feature in staging and confirm both the UI and direct backend route.
4. Apply the migration to production, then deploy the backend and storefront.
5. Keep the previous Vercel deployment available during the rollback window.

Do not edit production rows manually to hide a feature. Use the API so the
operator action remains auditable by the API/access logs.
