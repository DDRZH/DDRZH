# Secure Contact Endpoint Deployment

The contact form posts to `/api/contact`. Firebase Hosting rewrites that path to the `contact` Cloud Function.

## Required Firebase plan

Cloud Functions require the Firebase project to use the Blaze pay-as-you-go plan. Keep budget alerts enabled.

## Required EmailJS setting

In EmailJS Account > Security, enable private-key authorization for API requests. This prevents direct browser-only calls from using the public key.

## Required Firebase secrets

Set these before deploying functions:

```powershell
npx --yes firebase-tools functions:secrets:set EMAILJS_PUBLIC_KEY --project ddrzh-31cb8
npx --yes firebase-tools functions:secrets:set EMAILJS_PRIVATE_KEY --project ddrzh-31cb8
npx --yes firebase-tools functions:secrets:set EMAILJS_SERVICE_ID --project ddrzh-31cb8
npx --yes firebase-tools functions:secrets:set EMAILJS_TEMPLATE_ID --project ddrzh-31cb8
npx --yes firebase-tools functions:secrets:set CONTACT_TO_EMAIL --project ddrzh-31cb8
```

Use these current values except for the private key:

- `EMAILJS_PUBLIC_KEY`: your EmailJS public key
- `EMAILJS_SERVICE_ID`: `service_ynidhdl`
- `EMAILJS_TEMPLATE_ID`: `template_bc9qvtd`
- `CONTACT_TO_EMAIL`: `info@ddrzh.com`
- `EMAILJS_PRIVATE_KEY`: your EmailJS private key from Account > General

Do not commit secret values to the repository.

## Deploy

After secrets are set:

```powershell
npx --yes firebase-tools deploy --only functions,hosting --project ddrzh-31cb8
```
