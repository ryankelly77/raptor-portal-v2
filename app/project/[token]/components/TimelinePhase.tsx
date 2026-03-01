'use client';

import { useState } from 'react';
import { CheckIcon, DocumentIcon } from '@/components/icons';
import { TaskItem } from './TaskItem';
import { SurveyCallToAction } from './SurveyCallToAction';
import { SurveyResults } from './SurveyResults';
import { PropertyNotice } from './PropertyNotice';
import { BuildingAccessNotice } from './BuildingAccessNotice';
import type { PhaseData } from './ProjectContent';
import styles from '../project.module.css';

interface TimelinePhaseProps {
  phase: PhaseData;
  phaseNumber: number;
  locationImages?: string[];
  surveyToken?: string | null;
  surveyClicks?: number;
  surveyCompletions?: number;
  onRefresh: () => void;
  globalDocuments?: Record<string, { url: string; label?: string }>;
  readOnly?: boolean;
}

function formatDisplayDate(dateString?: string | null): string | null {
  if (!dateString) return null;
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function TimelinePhase({
  phase,
  phaseNumber,
  locationImages = [],
  surveyToken,
  surveyClicks,
  surveyCompletions,
  onRefresh,
  globalDocuments,
  readOnly = false,
}: TimelinePhaseProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const getMarkerContent = () => {
    if (phase.status === 'completed') {
      return <CheckIcon />;
    }
    return phaseNumber;
  };

  const getMarkerClass = () => {
    switch (phase.status) {
      case 'completed':
        return styles.timelineMarkerCompleted;
      case 'in-progress':
        return styles.timelineMarkerInProgress;
      default:
        return styles.timelineMarkerPending;
    }
  };

  const getStatusClass = () => {
    switch (phase.status) {
      case 'completed':
        return styles.phaseStatusCompleted;
      case 'in-progress':
        return styles.phaseStatusInProgress;
      default:
        return styles.phaseStatusPending;
    }
  };

  const getItemClass = () => {
    switch (phase.status) {
      case 'completed':
        return styles.timelineItemCompleted;
      case 'in-progress':
        return styles.timelineItemInProgress;
      default:
        return '';
    }
  };

  const isSurveyPhase = phase.title.toLowerCase().includes('survey');
  const isBuildingAccessPhase = phase.title.toLowerCase().includes('building access');
  const isEquipmentPhase = phase.title.toLowerCase().includes('equipment');
  const hasPmTasks = phase.tasks.some(t => t.label.startsWith('[PM]') || t.label.startsWith('[PM-TEXT]'));


  const showReadOnlyMessage = () => {
    alert('Only Property Managers or Raptor Vending can access these documents.');
  };

  return (
    <div className={`${styles.timelineItem} ${getItemClass()}`}>
      <div className={`${styles.timelineMarker} ${getMarkerClass()}`}>
        {getMarkerContent()}
      </div>
      <div className={styles.timelineContent}>
        <div className={styles.phaseHeader} onClick={() => setIsExpanded(!isExpanded)}>
          <div className={styles.phaseTitleRow}>
            <div className={styles.phaseTitle}>{phase.title}</div>
            {phase.isApproximate && (
              <span className={styles.approximateBadge}>Approximate</span>
            )}
          </div>
          <span className={`${styles.phaseStatus} ${getStatusClass()}`}>
            {phase.status === 'completed'
              ? 'Completed'
              : phase.status === 'in-progress'
              ? 'In Progress'
              : 'Pending'}
          </span>
        </div>

        {(phase.startDate || phase.endDate) && (
          <div className={styles.phaseDates}>
            {phase.isApproximate ? (
              <span className={styles.approximateDates}>
                {phase.startDate === phase.endDate
                  ? formatDisplayDate(phase.startDate)
                  : `${formatDisplayDate(phase.startDate) || 'TBD'} – ${formatDisplayDate(phase.endDate) || 'TBD'}`}
              </span>
            ) : (
              <span>
                {phase.startDate === phase.endDate
                  ? formatDisplayDate(phase.startDate)
                  : `${formatDisplayDate(phase.startDate) || 'TBD'} – ${formatDisplayDate(phase.endDate) || 'TBD'}`}
              </span>
            )}
          </div>
        )}

        <div className={`${styles.phaseDetails} ${isExpanded ? styles.phaseDetailsExpanded : ''}`}>
          {phase.description && (
            <div className={styles.phaseDescription}>{phase.description}</div>
          )}

          {/* Document link (not for property responsibility phases) */}
          {phase.document && !phase.propertyResponsibility && (
            <div className={styles.phaseDocument}>
              {readOnly ? (
                <span
                  className={`${styles.documentLink} ${styles.documentLinkReadonly}`}
                  onClick={showReadOnlyMessage}
                >
                  <DocumentIcon />
                  {phase.document.label}
                </span>
              ) : (
                <a
                  href={phase.document.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.documentLink}
                >
                  <DocumentIcon />
                  {phase.document.label}
                </a>
              )}
            </div>
          )}

          {/* Site images */}
          {((phase.documents && phase.documents.length > 0) || (locationImages && locationImages.length > 0)) && (
            <div className={styles.phaseImages}>
              <div className={styles.phaseImagesTitle}>Site Photos</div>
              <div className={styles.phaseImagesGrid}>
                {phase.documents?.map((doc, idx) => {
                  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.url);
                  const docName = doc.name || doc.label || 'Document';
                  return isImage ? (
                    <div
                      key={doc.id || idx}
                      className={styles.phaseImageThumb}
                      onClick={() => setPreviewImage(doc.url)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={doc.url} alt={docName} />
                    </div>
                  ) : (
                    <a
                      key={doc.id || idx}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.phaseDocThumb}
                    >
                      <DocumentIcon width={24} height={24} />
                      <span>{docName}</span>
                    </a>
                  );
                })}
                {(!phase.documents || phase.documents.length === 0) &&
                  locationImages.map((img, idx) => (
                    <div
                      key={idx}
                      className={styles.phaseImageThumb}
                      onClick={() => setPreviewImage(img)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={`Site ${idx + 1}`} />
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Image Preview Modal */}
          {previewImage && (
            <div className={styles.imagePreviewOverlay} onClick={() => setPreviewImage(null)}>
              <div className={styles.imagePreviewContent} onClick={(e) => e.stopPropagation()}>
                <button className={styles.imagePreviewClose} onClick={() => setPreviewImage(null)}>
                  ×
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewImage} alt="Preview" />
              </div>
            </div>
          )}

          {/* Survey CTA */}
          {isSurveyPhase && (
            <SurveyCallToAction
              surveyToken={surveyToken}
              surveyClicks={surveyClicks}
              surveyCompletions={surveyCompletions}
              pmTasks={phase.tasks.filter((t) => t.label.startsWith('[PM]') && !t.label.startsWith('[PM-TEXT]'))}
              pmTextTasks={phase.tasks.filter((t) => t.label.startsWith('[PM-TEXT]'))}
              onTaskUpdate={onRefresh}
              readOnly={readOnly}
            />
          )}

          {/* Property Responsibility Notice */}
          {phase.propertyResponsibility && (
            <PropertyNotice
              contractorInfo={phase.contractorInfo}
              tasks={phase.tasks}
              onRefresh={onRefresh}
              document={phase.document}
              globalDocuments={globalDocuments}
              readOnly={readOnly}
            />
          )}

          {/* Building Access Notice */}
          {isBuildingAccessPhase && (
            <BuildingAccessNotice
              tasks={phase.tasks}
              onRefresh={onRefresh}
              globalDocuments={globalDocuments}
              readOnly={readOnly}
              coiDocument={phase.document}
            />
          )}

          {/* Equipment Ordering PM tasks */}
          {isEquipmentPhase && hasPmTasks && (
            <BuildingAccessNotice
              tasks={phase.tasks}
              onRefresh={onRefresh}
              globalDocuments={globalDocuments}
              readOnly={readOnly}
              subtitle="Please confirm the following before equipment is ordered:"
            />
          )}

          {/* Generic PM action items for other phases */}
          {!isSurveyPhase &&
            !isBuildingAccessPhase &&
            !isEquipmentPhase &&
            !phase.propertyResponsibility &&
            hasPmTasks && (
              <BuildingAccessNotice
                tasks={phase.tasks}
                onRefresh={onRefresh}
                globalDocuments={globalDocuments}
                readOnly={readOnly}
                subtitle="Please complete the following:"
              />
            )}

          {/* Survey Results */}
          {phase.surveyResults && <SurveyResults results={phase.surveyResults} />}

          {/* Tasks */}
          <div className={styles.subtasks}>
            <div className={styles.subtasksTitle}>
              {phase.status === 'completed'
                ? 'Completed Tasks'
                : phase.status === 'in-progress'
                ? 'Task Progress'
                : 'Upcoming Tasks'}
            </div>
            {phase.tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                globalDocuments={globalDocuments}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>

        <button className={styles.expandToggle} onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? 'Show Less' : 'Show Details'}
        </button>
      </div>
    </div>
  );
}
