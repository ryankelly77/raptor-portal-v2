import { Metadata } from 'next';
import { fetchProjectByToken } from '@/lib/data/projects';
import { ProjectContent } from './components/ProjectContent';
import styles from './project.module.css';

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const project = await fetchProjectByToken(token);

  if (!project) {
    return {
      title: 'Project Not Found | Raptor Vending',
      robots: 'noindex, nofollow',
    };
  }

  return {
    title: `${project.propertyName} Installation | Raptor Vending`,
    description: `Track the installation progress for ${project.propertyName}`,
    robots: 'noindex, nofollow',
  };
}

export default async function ProjectPage({ params }: PageProps) {
  const { token } = await params;
  const project = await fetchProjectByToken(token);

  if (!project) {
    return (
      <div className="app">
        <div className={styles.error}>
          <h2>Project Not Found</h2>
          <p>The project you&apos;re looking for doesn&apos;t exist or is no longer available.</p>
        </div>
      </div>
    );
  }

  return <ProjectContent initialProject={project} token={token} />;
}
