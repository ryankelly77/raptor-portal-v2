'use client';

import { useState, useEffect, useCallback } from 'react';
import { Logo } from '@/components/Logo';
import { Header } from '@/components/Header';
import { OverallProgress } from '@/components/OverallProgress';
import { Timeline } from '@/app/project/[token]/components/Timeline';
import { ContactFooter } from '@/app/project/[token]/components/ContactFooter';
import { SendToPhoneModal } from '@/app/project/[token]/components/SendToPhoneModal';
import { PMWelcomeBanner } from './PMWelcomeBanner';
import { PMMobileHeader } from './PMMobileHeader';
import { PMMobileBottomBar } from './PMMobileBottomBar';
import { PMMessagesView } from './PMMessagesView';
import { PoweredBy } from './PoweredBy';
import type { PMPortalData, ProjectView } from '@/lib/data/projects';
import styles from '../pm-portal.module.css';

interface PMPortalContentProps {
  initialData: PMPortalData;
  token: string;
}

export function PMPortalContent({ initialData, token }: PMPortalContentProps) {
  const [data, setData] = useState<PMPortalData>(initialData);
  const [selectedProjectToken, setSelectedProjectToken] = useState<string>(
    initialData.projects[0]?.publicToken || ''
  );
  const [showSendToPhone, setShowSendToPhone] = useState(false);
  const [viewMode, setViewMode] = useState<'progress' | 'messages'>('progress');

  const currentUrl = typeof window !== 'undefined' ? window.location.href.split('?')[0] : '';

  // Get the currently selected project
  const selectedProject = data.projects.find((p) => p.publicToken === selectedProjectToken) || data.projects[0];

  // Refresh data from API
  const refreshData = useCallback(async () => {
    try {
      const response = await fetch(`/api/pm/${token}`);
      if (response.ok) {
        const newData = await response.json();
        setData(newData);
      }
    } catch (err) {
      console.error('Error refreshing portal data:', err);
    }
  }, [token]);

  // Set up document title
  useEffect(() => {
    document.title = `Property Manager Portal | Raptor Vending`;
  }, []);

  // Handle project selection and scroll
  const handleSelectProject = (projectToken: string) => {
    setSelectedProjectToken(projectToken);
    const project = data.projects.find((p) => p.publicToken === projectToken);
    if (project) {
      const el = document.getElementById(`property-${project.propertyName}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  // Get the current survey link (use first project's survey token if available)
  const surveyUrl = selectedProject?.surveyToken
    ? `/survey/${selectedProject.surveyToken}`
    : 'https://raptor-vending.com/building-survey/';

  return (
    <div className={styles.pmPortal}>
      {/* Sidebar */}
      <aside className={styles.pmSidebar}>
        <div className={styles.pmSidebarHeader}>
          <Logo variant="light" height={120} />
        </div>

        <div className={styles.pmSidebarInfo}>
          <h2>{data.propertyManager.name}</h2>
          <p>{data.propertyManager.company || ''}</p>
        </div>

        <nav className={styles.pmSidebarNav}>
          <h3>Your Properties</h3>
          {data.properties.map((prop) => (
            <button
              key={prop.id}
              className={`${styles.pmNavLink} ${selectedProject?.propertyName === prop.name ? styles.pmNavLinkActive : ''}`}
              onClick={() => {
                const project = data.projects.find((p) => p.propertyName === prop.name);
                if (project) handleSelectProject(project.publicToken);
              }}
            >
              {prop.name}
            </button>
          ))}
        </nav>

        <div className={styles.pmSidebarSurvey}>
          <h3>Employee Survey</h3>
          <p>Share this survey with tenants to customize their menu preferences.</p>
          <a href={surveyUrl} target="_blank" rel="noopener noreferrer" className={styles.pmSurveyBtn}>
            Share Survey →
          </a>
        </div>

        <div className={styles.pmSidebarSendPhone}>
          <button className={styles.sendPhoneBtn} onClick={() => setShowSendToPhone(true)}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="18"
              height="18"
            >
              <path d="M12 18h.01M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
            </svg>
            Send to Phone
          </button>
        </div>

        <div className={styles.pmSidebarFooter}>
          <PoweredBy />
        </div>
      </aside>

      {/* Mobile Header */}
      {selectedProject && <PMMobileHeader project={selectedProject} />}

      {/* Mobile Bottom Bar */}
      <PMMobileBottomBar
        project={selectedProject}
        projects={data.projects}
        selectedToken={selectedProjectToken}
        onSelectProject={handleSelectProject}
      />

      {/* Main Content */}
      <main className={styles.pmMain}>
        <div className={styles.pmMainHeader}>
          <div className={styles.pmViewToggle}>
            <button
              className={`${styles.pmToggleBtn} ${viewMode === 'progress' ? styles.pmToggleBtnActive : ''}`}
              onClick={() => setViewMode('progress')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="20"
                height="20"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <span>Installation Progress</span>
            </button>
            <button
              className={`${styles.pmToggleBtn} ${viewMode === 'messages' ? styles.pmToggleBtnActive : ''}`}
              onClick={() => setViewMode('messages')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="20"
                height="20"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Message Us</span>
            </button>
          </div>
        </div>

        {viewMode === 'progress' ? (
          <>
            {data.projects.length === 0 ? (
              <div className={styles.noProjects}>
                <h2>No Active Projects</h2>
                <p>You don&apos;t have any active installation projects at this time.</p>
              </div>
            ) : (
              data.projects.map((project) => (
                <div key={project.publicToken} id={`property-${project.propertyName}`} className={styles.pmProjectSection}>
                  <PMWelcomeBanner project={project} pmName={data.propertyManager.name} />
                  <div className={styles.progressWidget}>
                    <Header project={project as ProjectView} showLogo={false} />
                    <OverallProgress
                      progress={project.overallProgress}
                      estimatedCompletion={project.estimatedCompletion}
                      daysRemaining={project.daysRemaining}
                    />
                    <Timeline
                      phases={project.phases}
                      locationImages={project.locationImages}
                      surveyToken={project.surveyToken}
                      surveyClicks={project.surveyClicks}
                      surveyCompletions={project.surveyCompletions}
                      onRefresh={refreshData}
                      globalDocuments={project.globalDocuments}
                      readOnly={false}
                    />
                    {project.projectManager && <ContactFooter projectManager={project.projectManager} />}
                  </div>
                </div>
              ))
            )}
          </>
        ) : (
          <PMMessagesView
            pmId={data.propertyManager.id}
            pmName={data.propertyManager.name}
            onMessagesRead={() => {}}
          />
        )}
      </main>

      {/* Send to Phone Modal */}
      <SendToPhoneModal isOpen={showSendToPhone} onClose={() => setShowSendToPhone(false)} url={currentUrl} />
    </div>
  );
}
