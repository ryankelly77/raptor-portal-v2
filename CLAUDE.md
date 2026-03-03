# Claude Code Instructions

## Before Deploying

**ALWAYS run `npm run build` before committing/pushing to verify the build passes.**

TypeScript errors will fail the Vercel deployment. Common issues:
- Maps need explicit type parameters: `new Map<string, MyType>()`
- Return types should be explicit when TypeScript can't infer them

## Project Structure

- `/app/admin/inventory/` - Inventory management (FIFO batch tracking)
- `/lib/admin-fetch.ts` - Authenticated API calls (uses sessionStorage token)
- `/app/api/admin/crud/route.ts` - Generic CRUD endpoint for admin tables

## Build Version

Current build version is tracked in `/app/admin/inventory/receive/page.tsx` as `BUILD_VERSION`.
Increment the letter (A, B, C...) for significant changes.
