'use client';

import { FridgeIcon, CookerIcon, EnclosureIcon } from '@/components/icons';
import type { EquipmentData } from './ProjectContent';
import styles from '../project.module.css';

interface EquipmentCardProps {
  item: EquipmentData;
}

export function EquipmentCard({ item }: EquipmentCardProps) {
  const getIcon = () => {
    if (item.name.includes('Fridge')) return <FridgeIcon />;
    if (item.name.includes('Cooker')) return <CookerIcon />;
    return <EnclosureIcon />;
  };

  const getStatusClass = () => {
    switch (item.status) {
      case 'delivered':
        return styles.equipmentStatusDelivered;
      case 'ready':
        return styles.equipmentStatusReady;
      case 'in-transit':
        return styles.equipmentStatusInTransit;
      case 'fabricating':
        return styles.equipmentStatusFabricating;
      default:
        return styles.equipmentStatusPending;
    }
  };

  const getDotClass = () => {
    switch (item.status) {
      case 'delivered':
        return styles.statusDotDelivered;
      case 'ready':
        return styles.statusDotReady;
      case 'in-transit':
        return styles.statusDotInTransit;
      case 'fabricating':
        return styles.statusDotFabricating;
      default:
        return styles.statusDotPending;
    }
  };

  return (
    <div className={styles.equipmentCard}>
      <div className={styles.equipmentIcon}>{getIcon()}</div>
      <div className={styles.equipmentName}>{item.name}</div>
      <div className={styles.equipmentSpec}>
        {item.model} | {item.spec}
      </div>
      <div className={`${styles.equipmentStatus} ${getStatusClass()}`}>
        <span className={`${styles.statusDot} ${getDotClass()}`}></span>
        <span>{item.statusLabel}</span>
      </div>
    </div>
  );
}
