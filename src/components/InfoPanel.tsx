import React, { useEffect, useState } from 'react';
import { BUILDING_DEFINITIONS, type BuildingType, getBuildingStats } from '../game/config/GameDefinitions';
import { BUILDING_TEXTS } from '../game/config/GameText';

interface InfoPanelProps {
    type: BuildingType;
    level: number;
    resources: { gold: number, elixir: number };
    isExiting: boolean;
    onDelete: () => void;
    onMove: () => void;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ type, level, resources, isExiting, onDelete, onMove }) => {
    const [mountClass, setMountClass] = useState('');

    useEffect(() => {
        // Double RAF to ensure browser registers initial state before transition
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setMountClass('open');
            });
        });
    }, []);

    const def = BUILDING_DEFINITIONS[type];
    const stats = getBuildingStats(type, level); // Scaled stats
    const texts = BUILDING_TEXTS[type];

    // Calculate next level cost
    const maxLevel = def.maxLevel || 1;
    const isMaxLevel = level >= maxLevel;
    const nextLevelStats = !isMaxLevel ? getBuildingStats(type, level + 1) : null;
    const canAfford = nextLevelStats ? resources.gold >= nextLevelStats.cost : true;
    const upgradeDisabled = isMaxLevel || !canAfford;

    // CSS class logic
    const className = `info-panel ${isExiting ? 'exiting' : mountClass}`;

    return (
        <div className={className}>
            <div className="info-header">
                <div className="info-title-row">
                    <h2>{def?.name.toUpperCase() || type.toUpperCase()}</h2>
                    <span className="info-level">LVL {level}</span>
                </div>
                {texts?.flavor && (
                    <div className="info-flavor">{texts.flavor}</div>
                )}
            </div>

            <div className="info-body">
                <div className="info-stats">
                    <div className="stat-row">
                        <span className="stat-label">Health</span>
                        <span className="stat-value">{stats.maxHealth}</span>
                    </div>
                    {stats.damage && (
                        <div className="stat-row">
                            <span className="stat-label">Damage</span>
                            <span className="stat-value">{stats.damage}</span>
                        </div>
                    )}
                    {stats.fireRate && (
                        <div className="stat-row">
                            <span className="stat-label">Speed</span>
                            <span className="stat-value">{(stats.fireRate / 1000).toFixed(1)}s</span>
                        </div>
                    )}
                    {stats.damage && stats.fireRate && (
                        <div className="stat-row">
                            <span className="stat-label">DPS</span>
                            <span className="stat-value">{Math.round(stats.damage * (1000 / stats.fireRate))}</span>
                        </div>
                    )}
                    {stats.range && (
                        <div className="stat-row">
                            <span className="stat-label">Range</span>
                            <span className="stat-value">{stats.range}</span>
                        </div>
                    )}
                    {texts?.details && (
                        <div className="info-details">{texts.details}</div>
                    )}
                </div>

                <div className="info-actions">
                    <button className="action-btn-small" onClick={onMove}>
                        <div className="icon move-icon"></div> MOVE (M)
                    </button>
                    <button className="action-btn-small delete" onClick={onDelete}>
                        <div className="icon delete-icon"></div> SELL
                    </button>
                    <button
                        className={`action-btn-small upgrade ${upgradeDisabled ? 'disabled' : ''}`}
                        disabled={upgradeDisabled}
                    >
                        <div className="icon upgrade-icon"></div>
                        {isMaxLevel ? 'MAX LEVEL' : (
                            <>
                                <span>UPGRADE</span>
                                <span style={{ fontSize: '0.65rem', opacity: canAfford ? 1 : 0.7, color: canAfford ? '#ffd700' : '#ff4444' }}>
                                    {nextLevelStats?.cost} Gold
                                </span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
