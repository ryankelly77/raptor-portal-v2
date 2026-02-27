'use client';

import { ChartIcon } from '@/components/icons';
import styles from '../project.module.css';

interface SurveyResultsProps {
  results: {
    responseRate: string | number;
    topMeals: string[];
    topSnacks: string[];
    dietaryNotes?: string | null;
  };
}

export function SurveyResults({ results }: SurveyResultsProps) {
  return (
    <div className={styles.surveyResults}>
      <div className={styles.surveyResultsHeader}>
        <ChartIcon />
        <span>Survey Results</span>
        <span className={styles.responseRate}>{results.responseRate} response rate</span>
      </div>
      <div className={styles.surveyGrid}>
        <div className={styles.surveyItem}>
          <span className={styles.surveyItemLabel}>Top Meal Choices</span>
          <ul>
            {results.topMeals.map((meal, idx) => (
              <li key={idx}>{meal}</li>
            ))}
          </ul>
        </div>
        <div className={styles.surveyItem}>
          <span className={styles.surveyItemLabel}>Top Snack Choices</span>
          <ul>
            {results.topSnacks.map((snack, idx) => (
              <li key={idx}>{snack}</li>
            ))}
          </ul>
        </div>
      </div>
      {results.dietaryNotes && <div className={styles.dietaryNote}>{results.dietaryNotes}</div>}
    </div>
  );
}
