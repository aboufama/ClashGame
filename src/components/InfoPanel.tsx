import React, { useEffect, useState } from 'react';
import { BUILDING_DEFINITIONS, type BuildingType, getBuildingStats } from '../game/config/GameDefinitions';
import { BUILDING_TEXTS } from '../game/config/GameText';
interface InfoPanelProps {
    type: BuildingType;
    level: number;
    resources: { sol: number };
    isExiting: boolean;
    onDelete: () => void;
    onUpgrade: () => void;
    onMove: () => void;
    upgradeCost?: number;
    isMobile?: boolean;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ type, level, resources, isExiting, onDelete, onUpgrade, onMove, upgradeCost, isMobile = false }) => {
    const [mountClass, setMountClass] = useState('');

    useEffect(() => {
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

    // Use override cost if provided, else standard next level cost
    const finalCost = upgradeCost !== undefined ? upgradeCost : (nextLevelStats?.cost || 0);
    const canAfford = nextLevelStats ? resources.sol >= finalCost : true;
    const upgradeDisabled = isMaxLevel || !canAfford;

    // ... CSS logic ...
    const className = `info-panel ${isExiting ? 'exiting' : mountClass} ${isMobile ? 'mobile' : ''}`;

    return (
        <div className={className}>
            {/* ... header/body ... */}
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
                {/* ... existing stats structure ... */}
                <div className="info-stats">
                    <div className="stat-row">
                        <span className="stat-label">Health</span>
                        <span className="stat-value">
                            {stats.maxHealth}
                            {nextLevelStats && nextLevelStats.maxHealth > stats.maxHealth && (
                                <span style={{ color: '#44ff44', fontSize: '0.7rem', marginLeft: '4px' }}>
                                    (+{nextLevelStats.maxHealth - stats.maxHealth})
                                </span>
                            )}
                        </span>
                    </div>

                    {/* Defense Specific Stats */}
                    {stats.damage && (
                        <div className="stat-row">
                            <span className="stat-label">Damage</span>
                            <span className="stat-value">
                                {stats.damage}
                                {nextLevelStats?.damage && nextLevelStats.damage > stats.damage && (
                                    <span style={{ color: '#44ff44', fontSize: '0.7rem', marginLeft: '4px' }}>
                                        (+{nextLevelStats.damage - stats.damage})
                                    </span>
                                )}
                            </span>
                        </div>
                    )}
                    {stats.fireRate && (
                        <div className="stat-row">
                            <span className="stat-label">Speed</span>
                            <span className="stat-value">
                                {(stats.fireRate / 1000).toFixed(1)}s
                                {nextLevelStats?.fireRate && nextLevelStats.fireRate < stats.fireRate && (
                                    <span style={{ color: '#44ff44', fontSize: '0.7rem', marginLeft: '4px' }}>
                                        (-{((stats.fireRate - nextLevelStats.fireRate) / 1000).toFixed(1)}s)
                                    </span>
                                )}
                            </span>
                        </div>
                    )}
                    {stats.damage && stats.fireRate && (
                        <div className="stat-row">
                            <span className="stat-label">DPS</span>
                            <span className="stat-value">
                                {Math.round(stats.damage * (1000 / stats.fireRate))}
                                {nextLevelStats?.damage && nextLevelStats?.fireRate && (
                                    (() => {
                                        const currentDPS = Math.round(stats.damage * (1000 / stats.fireRate));
                                        const nextDPS = Math.round(nextLevelStats.damage * (1000 / nextLevelStats.fireRate));
                                        return nextDPS > currentDPS ? (
                                            <span style={{ color: '#44ff44', fontSize: '0.7rem', marginLeft: '4px' }}>
                                                (+{nextDPS - currentDPS})
                                            </span>
                                        ) : null;
                                    })()
                                )}
                            </span>
                        </div>
                    )}
                    {stats.range && (
                        <div className="stat-row">
                            <span className="stat-label">Range</span>
                            <span className="stat-value">{stats.range}</span>
                        </div>
                    )}

                    {/* Resource Specific Stats */}
                    {stats.productionRate && (
                        <>
                            <div className="stat-row">
                                <span className="stat-label">Production</span>
                                <span className="stat-value">
                                    {stats.productionRate}/s
                                    {nextLevelStats?.productionRate && nextLevelStats.productionRate > stats.productionRate && (
                                        <span style={{ color: '#44ff44', fontSize: '0.7rem', marginLeft: '4px' }}>
                                            (+{(nextLevelStats.productionRate - stats.productionRate).toFixed(1)})
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className="stat-row">
                                <span className="stat-label">Offline Rate</span>
                                <span className="stat-value">{(stats.productionRate * 0.2).toFixed(1)}/s</span>
                            </div>
                        </>
                    )}

                    {/* Army/Housing Specific Stats */}
                    {stats.capacity && (
                        <div className="stat-row">
                            <span className="stat-label">Housing</span>
                            <span className="stat-value">
                                +{stats.capacity}
                                {nextLevelStats?.capacity && nextLevelStats.capacity > (stats.capacity ?? 0) && (
                                    <span style={{ color: '#44ff44', fontSize: '0.7rem', marginLeft: '4px' }}>
                                        (+{nextLevelStats.capacity - (stats.capacity ?? 0)})
                                    </span>
                                )}
                            </span>
                        </div>
                    )}

                    {texts?.details && (
                        <div className="info-details">{texts.details}</div>
                    )}
                </div>

                <div className="info-actions">
                    <button className="action-btn-small" onClick={onMove}>
                        <div className="icon move-icon"></div> {isMobile ? 'MOVE' : 'MOVE (M)'}
                    </button>
                    <button className="action-btn-small delete" onClick={onDelete}>
                        <div className="icon delete-icon"></div> SELL
                    </button>
                    <button
                        className={`action-btn-small upgrade ${upgradeDisabled ? 'disabled' : ''}`}
                        disabled={upgradeDisabled}
                        onClick={onUpgrade}
                    >
                        <div className="icon upgrade-icon"></div>
                        {isMaxLevel ? 'MAX LEVEL' : (
                            <>
                                <span>UPGRADE</span>
                                <span style={{ fontSize: '0.65rem', opacity: canAfford ? 1 : 0.7, color: canAfford ? '#14F195' : '#ff4444' }}>
                                    {finalCost} SOL
                                </span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
