import { fetchProjectsByPMToken } from '@/lib/data/projects';
import { PMPortalContent } from './components/PMPortalContent';
import styles from './pm-portal.module.css';

interface PageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function PMPortalPage({ params }: PageProps) {
  const { token } = await params;

  let data;
  let error: string | null = null;

  try {
    data = await fetchProjectsByPMToken(token);
    if (!data) {
      error = 'Portal not found';
    }
  } catch (err) {
    console.error('Error loading PM portal:', err);
    error = 'Unable to load portal';
  }

  if (error || !data) {
    return (
      <div className={styles.pmPortal}>
        <div className={styles.noProjects}>
          <h2>Portal Not Found</h2>
          <p>{error || 'The portal you are looking for could not be found.'}</p>
        </div>
      </div>
    );
  }

  return <PMPortalContent initialData={data} token={token} />;
}
