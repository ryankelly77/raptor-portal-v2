'use client';

import { EquipmentCard } from './EquipmentCard';
import type { EquipmentData } from './ProjectContent';
import styles from '../project.module.css';

interface EquipmentSectionProps {
  equipment: EquipmentData[];
}

export function EquipmentSection({ equipment }: EquipmentSectionProps) {
  return (
    <div className={styles.equipmentSection}>
      <h2 className={styles.sectionTitle}>Equipment Status</h2>
      <div className={styles.equipmentGrid}>
        {equipment.map((item, idx) => (
          <EquipmentCard key={item.id || idx} item={item} />
        ))}
      </div>
    </div>
  );
}
