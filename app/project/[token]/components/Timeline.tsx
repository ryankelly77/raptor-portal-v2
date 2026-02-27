'use client';

import { TimelinePhase } from './TimelinePhase';
import type { PhaseData } from './ProjectContent';
import styles from '../project.module.css';

interface TimelineProps {
  phases: PhaseData[];
  locationImages?: string[];
  surveyToken?: string | null;
  surveyClicks?: number;
  surveyCompletions?: number;
  onRefresh: () => void;
  globalDocuments?: Record<string, { url: string; label?: string }>;
  readOnly?: boolean;
}

export function Timeline({
  phases,
  locationImages = [],
  surveyToken,
  surveyClicks,
  surveyCompletions,
  onRefresh,
  globalDocuments,
  readOnly = false,
}: TimelineProps) {
  return (
    <div className={styles.timelineSection}>
      <h2 className={styles.sectionTitle}>Installation Timeline</h2>
      <div className={styles.timeline}>
        {phases.map((phase, idx) => (
          <TimelinePhase
            key={phase.id}
            phase={phase}
            phaseNumber={idx + 1}
            locationImages={idx === 0 ? locationImages : []}
            surveyToken={surveyToken}
            surveyClicks={surveyClicks}
            surveyCompletions={surveyCompletions}
            onRefresh={onRefresh}
            globalDocuments={globalDocuments}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}
