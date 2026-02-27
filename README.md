# Raptor Installation Portal (Next.js)

A comprehensive installation progress tracking portal for Raptor Vending. This application enables property managers to track vending machine installations, administrators to manage projects and communications, and drivers to log temperature data during food deliveries.

> **Note:** This is a migration from a Create React App (CRA) project. See [MIGRATION.md](./MIGRATION.md) for migration context and decisions.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **Email:** Mailgun
- **CRM:** HighLevel (GoHighLevel)

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Mailgun account (for email notifications)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd raptor-portal-next

# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local

# Fill in your environment variables in .env.local
# See .env.local.example for required variables

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Available Routes

### Page Routes

| Route | Description |
|-------|-------------|
| `/` | Home page with portal branding |
| `/project/[token]` | Public project view (read-only) |
| `/pm/[token]` | Property Manager portal |
| `/admin/login` | Admin login page |
| `/admin` | Admin dashboard |
| `/admin/projects` | Project list |
| `/admin/projects/[id]` | Project detail/edit |
| `/admin/property-managers` | Property manager management |
| `/admin/documents` | Global document management |
| `/admin/templates` | Email template editor |
| `/admin/messages` | Cross-project messaging |
| `/admin/activity` | Activity log viewer |
| `/admin/migrations` | Database migrations & SQL |
| `/admin/temperature` | Temperature log admin |
| `/driver/login` | Driver login page |
| `/driver` | Driver temperature logging interface |
| `/survey/[token]` | Survey redirect with click tracking |
| `/request-link` | Request portal link via email/phone |

### API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/admin/auth` | POST | Admin authentication |
| `/api/admin/crud` | POST | Generic CRUD operations |
| `/api/admin/upload` | POST | File upload to Supabase storage |
| `/api/driver/auth` | POST | Driver authentication |
| `/api/driver/temp-log` | POST | Temperature log operations |
| `/api/pm/[token]` | GET/POST | PM portal data operations |
| `/api/cron/send-reminders` | GET | Cron job for email reminders |
| `/api/notifications/delivery` | POST | Delivery notifications |
| `/api/notifications/sms` | POST | SMS notifications |
| `/api/survey-track` | POST | Survey click/completion tracking |
| `/api/request-link` | POST | Request portal link |
| `/api/sync-contact` | POST | Sync contact to HighLevel CRM |
| `/api/webhooks/mailgun` | POST | Mailgun webhook handler |

## Deployment

### Vercel Deployment

1. Push to your GitHub repository
2. Import project in Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy

### Environment Variables

Required environment variables (see `.env.local.example`):

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_URL` - Supabase URL (server-side)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `ADMIN_PASSWORD` - Admin login password
- `JWT_SECRET` - JWT signing secret
- `MAILGUN_API_KEY` - Mailgun API key
- `MAILGUN_DOMAIN` - Mailgun domain
- `MAILGUN_WEBHOOK_SIGNING_KEY` - Mailgun webhook signing key
- `FROM_EMAIL` - Sender email address
- `HIGHLEVEL_API_KEY` - HighLevel API key
- `HIGHLEVEL_LOCATION_ID` - HighLevel location ID
- `CRON_SECRET` - Secret for cron job authentication
- `PORTAL_URL` - Base URL of the portal

### Cron Jobs

Configure a cron job in Vercel to call `/api/cron/send-reminders` daily:

```json
{
  "crons": [
    {
      "path": "/api/cron/send-reminders",
      "schedule": "0 9 * * *"
    }
  ]
}
```

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

## License

Proprietary - Raptor Vending
