# Template provenance

Adapted from the user-provided Codex Sites 0.1.66 `sites-building/templates/vinext-starter`.

The UI catalog, hooks, utilities, Tailwind stylesheet and vendored Shadcn CSS originate from that template. The vendored CSS license is preserved beside the file. Dependencies retain their own licenses.

Qoder adaptations replace Vinext/Next server rendering and Cloudflare configuration with a Vite static build; remove D1/Drizzle, R2 and ChatGPT authentication scaffolding; set Shadcn to client rendering; and make the toast component use its system theme without a Next theme provider. The Function example reuses Qoder Sites' credential-free handler. No upstream hosting, auth or resource configuration is copied into generated projects.
