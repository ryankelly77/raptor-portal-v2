import Link from 'next/link';
import Image from 'next/image';

export default function NotFound() {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <Image
          src="/logo-dark.png"
          alt="Raptor Vending"
          width={100}
          height={40}
          style={styles.logo}
        />
        <h1 style={styles.code}>404</h1>
        <h2 style={styles.title}>Page Not Found</h2>
        <p style={styles.message}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div style={styles.actions}>
          <Link href="/" style={styles.homeBtn}>
            Go Home
          </Link>
          <Link href="/request-link" style={styles.linkBtn}>
            Request Portal Link
          </Link>
        </div>
        <p style={styles.help}>
          Need help?{' '}
          <a href="mailto:support@raptorvending.com" style={styles.link}>
            Contact Support
          </a>
        </p>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f5f5f5 0%, #e5e7eb 100%)',
    padding: '24px',
  },
  card: {
    background: '#fff',
    borderRadius: '16px',
    padding: '48px 40px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    width: '100%',
    maxWidth: '440px',
    textAlign: 'center',
  },
  logo: {
    marginBottom: '32px',
  },
  code: {
    fontSize: '72px',
    fontWeight: 800,
    color: '#ea580c',
    margin: '0 0 8px 0',
    lineHeight: 1,
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#1f2937',
    margin: '0 0 12px 0',
  },
  message: {
    fontSize: '16px',
    color: '#6b7280',
    margin: '0 0 32px 0',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '32px',
  },
  homeBtn: {
    display: 'block',
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    background: '#ea580c',
    borderRadius: '8px',
    textDecoration: 'none',
  },
  linkBtn: {
    display: 'block',
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: 500,
    color: '#374151',
    background: '#f3f4f6',
    borderRadius: '8px',
    textDecoration: 'none',
    border: '1px solid #e5e7eb',
  },
  help: {
    fontSize: '14px',
    color: '#9ca3af',
    margin: 0,
  },
  link: {
    color: '#ea580c',
    textDecoration: 'none',
  },
};
