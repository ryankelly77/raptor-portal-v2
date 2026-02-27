import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  return (
    <div style={styles.app}>
      <div style={styles.homeContainer}>
        <div style={styles.logoWrapper}>
          <Image
            src="/logo-dark.png"
            alt="Raptor Vending"
            width={140}
            height={56}
            priority
          />
        </div>
        <h1 style={styles.title}>Installation Progress Portal</h1>
        <p style={styles.subtitle}>
          Track your Raptor Vending installation in real-time.
        </p>
        <p style={styles.helpText}>
          Use the link provided by your project manager to access your installation progress.
        </p>
        <div style={styles.actions}>
          <Link href="/admin" style={styles.adminBtn}>
            Admin Access
          </Link>
          <Link href="/request-link" style={styles.requestBtn}>
            Request Portal Link
          </Link>
        </div>
        <div style={styles.driverLink}>
          <Link href="/driver/login" style={styles.driverBtn}>
            Driver Login
          </Link>
        </div>
      </div>
      <footer style={styles.poweredBy}>
        <span style={styles.poweredByText}>Powered by</span>
        <Image
          src="/logo-dark.png"
          alt="Raptor Vending"
          width={80}
          height={32}
        />
      </footer>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  app: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f8fafc 0%, #e5e7eb 100%)',
    padding: '24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  homeContainer: {
    textAlign: 'center',
    maxWidth: '480px',
  },
  logoWrapper: {
    marginBottom: '30px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#1f2937',
    margin: '0 0 12px 0',
  },
  subtitle: {
    fontSize: '18px',
    color: '#4b5563',
    margin: '0 0 8px 0',
  },
  helpText: {
    marginTop: '20px',
    color: '#9ca3af',
    fontSize: '14px',
  },
  actions: {
    marginTop: '40px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  adminBtn: {
    display: 'inline-block',
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    background: '#ea580c',
    borderRadius: '8px',
    textDecoration: 'none',
    transition: 'background 0.2s',
  },
  requestBtn: {
    display: 'inline-block',
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: 500,
    color: '#374151',
    background: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    textDecoration: 'none',
    transition: 'background 0.2s',
  },
  driverLink: {
    marginTop: '24px',
  },
  driverBtn: {
    fontSize: '14px',
    color: '#6b7280',
    textDecoration: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
  },
  poweredBy: {
    position: 'fixed',
    bottom: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    opacity: 0.6,
  },
  poweredByText: {
    fontSize: '12px',
    color: '#9ca3af',
  },
};
