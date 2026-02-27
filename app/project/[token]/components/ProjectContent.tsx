'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { Header } from '@/components/Header';
import { OverallProgress } from '@/components/OverallProgress';
import { Timeline } from './Timeline';
import { EquipmentSection } from './EquipmentSection';
import { SendToPhoneModal } from './SendToPhoneModal';
import { PMWelcomeHeader } from './PMWelcomeHeader';
import { PoweredBy } from './PoweredBy';
import { ContactFooter } from './ContactFooter';
import styles from '../project.module.css';

interface ProjectContentProps {
  initialProject: ProjectData;
  token: string;
}

export interface ProjectData {
  id: string;
  propertyName: string;
  address: string;
  locationName?: string | null;
  locationFloor?: string | null;
  employeeCount?: number | string;
  configuration?: unknown;
  overallProgress: number | null;
  estimatedCompletion: string;
  daysRemaining?: number | null;
  phases: PhaseData[];
  equipment?: EquipmentData[];
  surveyToken?: string | null;
  surveyClicks?: number;
  surveyCompletions?: number;
  locationImages?: string[];
  globalDocuments?: Record<string, { url: string; label?: string }>;
  propertyManager?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company?: string | null;
  } | null;
  projectManager?: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

export interface PhaseData {
  id: string;
  title: string;
  status: 'completed' | 'in-progress' | 'pending' | string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isApproximate?: boolean;
  propertyResponsibility?: string | null;
  contractorInfo?: {
    name: string;
    scheduledDate: string | null;
    status?: string | null;
  } | null;
  document?: {
    url: string;
    label: string;
  } | null;
  documents?: Array<{
    id?: string;
    url: string;
    name?: string;
    label?: string;
  }>;
  tasks: TaskData[];
  surveyResults?: {
    responseRate: string | number;
    topMeals: string[];
    topSnacks: string[];
    dietaryNotes?: string | null;
  } | null;
}

export interface TaskData {
  id: string;
  label: string;
  completed: boolean;
  scheduled_date?: string | null;
  upload_speed?: string | null;
  download_speed?: string | null;
  enclosure_type?: string | null;
  enclosure_color?: string | null;
  custom_color_name?: string | null;
  smartfridge_qty?: number | null;
  smartcooker_qty?: number | null;
  deliveries?: Array<{
    equipment: string;
    date?: string;
    carrier?: string;
    tracking?: string;
  }> | null;
  document_url?: string | null;
  pm_text_value?: string | null;
  pm_text_response?: string | null;
}

export interface EquipmentData {
  id: string;
  name: string;
  model?: string | null;
  spec?: string | null;
  status: string | null;
  statusLabel?: string | null;
}

export function ProjectContent({ initialProject, token }: ProjectContentProps) {
  const searchParams = useSearchParams();
  const isAdminPreview = searchParams.get('admin') === '1';

  const [project, setProject] = useState<ProjectData>(initialProject);
  const [showSendToPhone, setShowSendToPhone] = useState(false);
  const [viewMode, setViewMode] = useState<'progress' | 'messages'>('progress');
  const [unreadCount] = useState(0);

  const currentUrl = typeof window !== 'undefined' ? window.location.href.split('?')[0] : '';

  const refreshProject = useCallback(async () => {
    try {
      const response = await fetch(`/api/project/${token}`);
      if (response.ok) {
        const data = await response.json();
        setProject(data);
      }
    } catch (err) {
      console.error('Error refreshing project:', err);
    }
  }, [token]);

  // Set up document title
  useEffect(() => {
    document.title = `${project.propertyName} Installation | Raptor Vending`;
  }, [project.propertyName]);

  // Admin preview mode - simplified view
  if (isAdminPreview) {
    return (
      <div className={styles.adminPreviewView}>
        <main className={styles.pmMain} style={{ marginLeft: 0 }}>
          <h1 className={styles.pmMainTitle}>Installation Progress</h1>
          <div className={styles.progressWidget}>
            <Header project={project} showLogo={false} />
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
              onRefresh={refreshProject}
              globalDocuments={project.globalDocuments}
              readOnly={true}
            />
            {project.projectManager && <ContactFooter projectManager={project.projectManager} />}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.pmPortal}>
      {/* Sidebar */}
      <aside className={styles.pmSidebar}>
        <div className={styles.pmSidebarHeader}>
          <Logo variant="light" height={120} />
        </div>

        <div className={styles.pmSidebarInfo}>
          <h2>{project.propertyManager?.name || 'Property Manager'}</h2>
          <p>{project.propertyManager?.company || ''}</p>
        </div>

        <nav className={styles.pmSidebarNav}>
          <h3>Your Properties</h3>
          <span className={styles.pmNavLink}>{project.propertyName}</span>
        </nav>

        <div className={styles.pmSidebarSurvey}>
          <h3>Employee Survey</h3>
          <p>Share this survey with tenants to customize their menu preferences.</p>
          <a
            href={project.surveyToken ? `/survey/${project.surveyToken}` : 'https://raptor-vending.com/building-survey/'}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.pmSurveyBtn}
          >
            Share Survey →
          </a>
        </div>

        <div className={styles.pmSidebarSendPhone}>
          <button className={styles.sendPhoneBtn} onClick={() => setShowSendToPhone(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
              <path d="M12 18h.01M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
            </svg>
            Send to Phone
          </button>
        </div>

        <div className={styles.pmSidebarFooter}>
          <PoweredBy />
        </div>
      </aside>

      {/* Main Content */}
      <main className={styles.pmMain}>
        <div className={styles.pmMainHeader}>
          <div className={styles.pmViewToggle}>
            <button
              className={`${styles.pmToggleBtn} ${viewMode === 'progress' ? styles.pmToggleBtnActive : ''}`}
              onClick={() => setViewMode('progress')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              <span>Installation Progress</span>
            </button>
            <button
              className={`${styles.pmToggleBtn} ${viewMode === 'messages' ? styles.pmToggleBtnActive : ''}`}
              onClick={() => setViewMode('messages')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span>Message Us</span>
              {unreadCount > 0 && (
                <span className={styles.pmUnreadBadge}>{unreadCount}</span>
              )}
            </button>
          </div>
        </div>

        {viewMode === 'progress' ? (
          <>
            <PMWelcomeHeader project={project} />
            <div className={styles.progressWidget}>
              <Header project={project} showLogo={false} />
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
                onRefresh={refreshProject}
                globalDocuments={project.globalDocuments}
                readOnly={false}
              />
              {project.equipment && project.equipment.length > 0 && (
                <EquipmentSection equipment={project.equipment} />
              )}
              {project.projectManager && <ContactFooter projectManager={project.projectManager} />}
            </div>
          </>
        ) : (
          <div className={styles.progressWidget}>
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p>Messaging feature coming soon...</p>
            </div>
          </div>
        )}
      </main>

      {/* Send to Phone Modal */}
      <SendToPhoneModal
        isOpen={showSendToPhone}
        onClose={() => setShowSendToPhone(false)}
        url={currentUrl}
      />
    </div>
  );
}
