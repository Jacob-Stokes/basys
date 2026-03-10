import React from 'react';
import { useTranslation } from 'react-i18next';
import { darkenColor, getReadableTextColor, lightenColor } from '../utils/color';
import { DEFAULT_FALLBACK_COLOR } from '../context/DisplaySettingsContext';

interface ActionItem {
  id: string;
  position: number;
  title: string;
  description?: string | null;
}

interface SubGoal {
  id: string;
  position: number;
  title: string;
  description?: string | null;
  actions: ActionItem[];
}

interface FullGridViewProps {
  goalTitle: string;
  subGoals: SubGoal[];
  onActionClick: (action: ActionItem) => void;
  onSubGoalClick: (subGoal: SubGoal) => void;
  onAddSubGoal: (position: number) => void;
  onAddAction: (subGoalId: string, position: number) => void;
  onUpdateSubGoal?: (subGoal: SubGoal) => void;
  onUpdateAction?: (action: ActionItem) => void;
  gridAspect: 'square' | 'rectangle';
  onCenterClick?: () => void;
  subGoalColors: Record<number, string>;
  actionColorSettings: {
    inherit: boolean;
    shadePercent: number;
  };
  centerLayout: 'single' | 'radial';
  centerBackdrop: 'page' | 'card';
  onSubGoalDragStart?: (subGoal: SubGoal) => void;
  onSubGoalDrop?: (targetPosition: number) => void;
  onSubGoalDragEnd?: () => void;
  onActionDragStart?: (subGoalId: string, action: ActionItem) => void;
  onActionDrop?: (subGoalId: string, targetPosition: number) => void;
  onActionDragEnd?: () => void;
  readOnly?: boolean;
  editMode?: boolean;
}

export default function FullGridView({
  goalTitle,
  subGoals,
  onActionClick,
  onSubGoalClick,
  onAddSubGoal,
  onAddAction,
  onUpdateSubGoal,
  onUpdateAction,
  gridAspect,
  onCenterClick,
  subGoalColors,
  actionColorSettings,
  centerLayout,
  centerBackdrop,
  onSubGoalDragStart,
  onSubGoalDrop,
  onSubGoalDragEnd,
  onActionDragStart,
  onActionDrop,
  onActionDragEnd,
  readOnly = false,
  editMode = false
}: FullGridViewProps) {
  const { t } = useTranslation();
  const isEditable = editMode && !readOnly;

  const getSubGoalAtPosition = (position: number): SubGoal | undefined => {
    return subGoals.find(sg => sg.position === position);
  };

  const getColorForPosition = (position: number) => {
    return subGoalColors[position] || DEFAULT_FALLBACK_COLOR;
  };

  const allowDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const centerBackgroundClass =
    centerBackdrop === 'page' ? 'bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700';

  const renderCenterCell = () => {
    if (centerLayout === 'radial') {
      const bridgeConfig = [
        { area: '1 / 2 / 2 / 3', position: 2, arrow: '↓' },
        { area: '2 / 3 / 3 / 4', position: 4, arrow: '←' },
        { area: '3 / 2 / 4 / 3', position: 6, arrow: '↑' },
        { area: '2 / 1 / 3 / 2', position: 8, arrow: '→' },
        { area: '1 / 1 / 2 / 2', position: 1, arrow: '↘' },
        { area: '1 / 3 / 2 / 4', position: 3, arrow: '↙' },
        { area: '3 / 3 / 4 / 4', position: 5, arrow: '↖' },
        { area: '3 / 1 / 4 / 2', position: 7, arrow: '↗' },
      ];

      return (
        <div
          key="center-radial"
          className={`col-span-3 row-span-3 rounded-lg p-2 sm:p-3 border ${centerBackgroundClass}`}
          style={{ aspectRatio: gridAspect === 'square' ? '1' : 'auto' }}
        >
          <div className="grid grid-cols-3 grid-rows-3 gap-1 h-full">
            {bridgeConfig.map((bridge) => {
              const subGoal = getSubGoalAtPosition(bridge.position);
              if (!subGoal && !isEditable) {
                return <div key={`bridge-${bridge.position}`} style={{ gridArea: bridge.area }} />;
              }
              const color = getColorForPosition(bridge.position);
              const bg = lightenColor(color, 65);
              return (
                <div
                  key={`bridge-${bridge.position}`}
                  style={{ gridArea: bridge.area }}
                  className="rounded-md border text-[10px] sm:text-xs flex flex-col items-center justify-center text-center px-1 py-1"
                >
                  <div
                    className="w-full rounded px-1 py-0.5 font-medium"
                    style={{
                      backgroundColor: bg,
                      color: getReadableTextColor(bg),
                    }}
                  >
                    {subGoal ? subGoal.title : t('fullGrid.subGoalPosition', { position: bridge.position })}
                  </div>
                  <div className="mt-1 text-gray-500 dark:text-gray-400" aria-hidden="true">
                    {bridge.arrow}
                  </div>
                </div>
              );
            })}
            <div
              className={`col-start-2 row-start-2 flex items-center justify-center text-center font-bold ${gridAspect === 'rectangle' ? 'text-base sm:text-xl' : 'text-sm sm:text-lg'} px-2 rounded-md bg-blue-600 text-white transition-colors ${isEditable ? 'cursor-pointer hover:bg-blue-700' : ''}`}
              onClick={isEditable ? onCenterClick : undefined}
              title={isEditable ? t('fullGrid.clickToEditDescription') : undefined}
            >
              {goalTitle}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key="center-single"
        className={`col-span-3 row-span-3 rounded-lg p-1 sm:p-2 border ${centerBackgroundClass}`}
        style={{ aspectRatio: gridAspect === 'square' ? '1' : 'auto' }}
      >
        <div
          onClick={isEditable ? onCenterClick : undefined}
          className={`w-full h-full bg-blue-600 text-white flex items-center justify-center font-bold ${gridAspect === 'rectangle' ? 'text-lg sm:text-2xl' : 'text-base sm:text-lg'} transition-colors text-center px-4 rounded-md ${isEditable ? 'cursor-pointer hover:bg-blue-700' : ''}`}
          title={isEditable ? t('fullGrid.clickToEditDescription') : undefined}
        >
          {goalTitle}
        </div>
      </div>
    );
  };

  // Static position maps (declared once outside renderCell for reuse)
  const subGoalMap: { [key: string]: number } = {
    '1-1': 1, '1-4': 2, '1-7': 3,
    '4-7': 4,
    '7-7': 5, '7-4': 6, '7-1': 7,
    '4-1': 8
  };

  const actionMaps: { [key: string]: { subGoalPos: number; actionPos: number } } = {
    '0-0': { subGoalPos: 1, actionPos: 1 }, '0-1': { subGoalPos: 1, actionPos: 2 }, '0-2': { subGoalPos: 1, actionPos: 3 },
    '1-2': { subGoalPos: 1, actionPos: 4 },
    '2-2': { subGoalPos: 1, actionPos: 5 }, '2-1': { subGoalPos: 1, actionPos: 6 }, '2-0': { subGoalPos: 1, actionPos: 7 },
    '1-0': { subGoalPos: 1, actionPos: 8 },
    '0-3': { subGoalPos: 2, actionPos: 1 }, '0-4': { subGoalPos: 2, actionPos: 2 }, '0-5': { subGoalPos: 2, actionPos: 3 },
    '1-5': { subGoalPos: 2, actionPos: 4 },
    '2-5': { subGoalPos: 2, actionPos: 5 }, '2-4': { subGoalPos: 2, actionPos: 6 }, '2-3': { subGoalPos: 2, actionPos: 7 },
    '1-3': { subGoalPos: 2, actionPos: 8 },
    '0-6': { subGoalPos: 3, actionPos: 1 }, '0-7': { subGoalPos: 3, actionPos: 2 }, '0-8': { subGoalPos: 3, actionPos: 3 },
    '1-8': { subGoalPos: 3, actionPos: 4 },
    '2-8': { subGoalPos: 3, actionPos: 5 }, '2-7': { subGoalPos: 3, actionPos: 6 }, '2-6': { subGoalPos: 3, actionPos: 7 },
    '1-6': { subGoalPos: 3, actionPos: 8 },
    '3-6': { subGoalPos: 4, actionPos: 1 }, '3-7': { subGoalPos: 4, actionPos: 2 }, '3-8': { subGoalPos: 4, actionPos: 3 },
    '4-8': { subGoalPos: 4, actionPos: 4 },
    '5-8': { subGoalPos: 4, actionPos: 5 }, '5-7': { subGoalPos: 4, actionPos: 6 }, '5-6': { subGoalPos: 4, actionPos: 7 },
    '4-6': { subGoalPos: 4, actionPos: 8 },
    '6-6': { subGoalPos: 5, actionPos: 1 }, '6-7': { subGoalPos: 5, actionPos: 2 }, '6-8': { subGoalPos: 5, actionPos: 3 },
    '7-8': { subGoalPos: 5, actionPos: 4 },
    '8-8': { subGoalPos: 5, actionPos: 5 }, '8-7': { subGoalPos: 5, actionPos: 6 }, '8-6': { subGoalPos: 5, actionPos: 7 },
    '7-6': { subGoalPos: 5, actionPos: 8 },
    '6-3': { subGoalPos: 6, actionPos: 1 }, '6-4': { subGoalPos: 6, actionPos: 2 }, '6-5': { subGoalPos: 6, actionPos: 3 },
    '7-5': { subGoalPos: 6, actionPos: 4 },
    '8-5': { subGoalPos: 6, actionPos: 5 }, '8-4': { subGoalPos: 6, actionPos: 6 }, '8-3': { subGoalPos: 6, actionPos: 7 },
    '7-3': { subGoalPos: 6, actionPos: 8 },
    '6-0': { subGoalPos: 7, actionPos: 1 }, '6-1': { subGoalPos: 7, actionPos: 2 }, '6-2': { subGoalPos: 7, actionPos: 3 },
    '7-2': { subGoalPos: 7, actionPos: 4 },
    '8-2': { subGoalPos: 7, actionPos: 5 }, '8-1': { subGoalPos: 7, actionPos: 6 }, '8-0': { subGoalPos: 7, actionPos: 7 },
    '7-0': { subGoalPos: 7, actionPos: 8 },
    '3-0': { subGoalPos: 8, actionPos: 1 }, '3-1': { subGoalPos: 8, actionPos: 2 }, '3-2': { subGoalPos: 8, actionPos: 3 },
    '4-2': { subGoalPos: 8, actionPos: 4 },
    '5-2': { subGoalPos: 8, actionPos: 5 }, '5-1': { subGoalPos: 8, actionPos: 6 }, '5-0': { subGoalPos: 8, actionPos: 7 },
    '4-0': { subGoalPos: 8, actionPos: 8 },
  };

  // Check if a cell has content (sub-goal or action exists)
  const isCellFilled = (row: number, col: number): boolean => {
    if (row >= 3 && row <= 5 && col >= 3 && col <= 5) return true; // center always filled
    const sgPos = subGoalMap[`${row}-${col}`];
    if (sgPos) return Boolean(getSubGoalAtPosition(sgPos));
    const aInfo = actionMaps[`${row}-${col}`];
    if (aInfo) {
      const sg = getSubGoalAtPosition(aInfo.subGoalPos);
      return Boolean(sg && sg.actions.find(a => a.position === aInfo.actionPos));
    }
    return false;
  };

  const renderCell = (row: number, col: number) => {
    const subGoalPos = subGoalMap[`${row}-${col}`];

    if (subGoalPos) {
      const subGoal = getSubGoalAtPosition(subGoalPos);

      if (!subGoal) {
        if (!isEditable) {
          return <div className="h-full" />;
        }
        return (
          <div
            onClick={() => onAddSubGoal(subGoalPos)}
            onDragOver={onSubGoalDrop ? allowDrop : undefined}
            onDrop={
              onSubGoalDrop
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSubGoalDrop(subGoalPos);
                  }
                : undefined
            }
            className="bg-yellow-50 border border-yellow-300 p-1 flex items-center justify-center cursor-pointer hover:bg-yellow-100 text-xs h-full"
          >
            <span className="text-yellow-700">{t('fullGrid.addSubGoal', { position: subGoalPos })}</span>
          </div>
        );
      }

      const color = getColorForPosition(subGoalPos);
      const textColor = getReadableTextColor(color);
      return (
        <div
          className={`p-1 h-full flex items-center justify-center rounded ${isEditable ? 'cursor-pointer' : ''}`}
          style={{
            backgroundColor: color,
            border: `2px solid ${darkenColor(color, 12)}`,
            color: textColor,
          }}
          onClick={() => onSubGoalClick(subGoal)}
          draggable={isEditable ? Boolean(onSubGoalDragStart) : false}
          onDragStart={isEditable ? (e) => {
            if (!onSubGoalDragStart) return;
            e.dataTransfer.effectAllowed = 'move';
            onSubGoalDragStart(subGoal);
          } : undefined}
          onDragEnd={isEditable ? () => { onSubGoalDragEnd?.(); } : undefined}
          onDragOver={isEditable ? (onSubGoalDrop ? allowDrop : undefined) : undefined}
          onDrop={isEditable ? (
            onSubGoalDrop
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSubGoalDrop(subGoalPos);
                }
              : undefined
          ) : undefined}
          onContextMenu={isEditable ? (e) => {
            e.preventDefault();
            onUpdateSubGoal?.(subGoal);
          } : undefined}
          title={isEditable ? t('fullGrid.clickToViewActions') : subGoal.title}
        >
          <div className={`font-semibold ${gridAspect === 'rectangle' ? 'text-sm' : 'text-xs'} text-center break-words`}>{subGoal.title}</div>
        </div>
      );
    }

    const actionInfo = actionMaps[`${row}-${col}`];

    if (actionInfo) {
      const subGoal = getSubGoalAtPosition(actionInfo.subGoalPos);

      if (!subGoal) {
        if (!isEditable) return <div className="h-full" />;
        return <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 h-full"></div>;
      }

      const action = subGoal.actions.find(a => a.position === actionInfo.actionPos);
      const parentColor = getColorForPosition(actionInfo.subGoalPos);
      const shadeAmount = Math.min(Math.max(actionColorSettings.shadePercent, 0), 100);
      const actionBg = actionColorSettings.inherit
        ? lightenColor(parentColor, shadeAmount)
        : '#ffffff';
      const actionTextColor = actionColorSettings.inherit
        ? getReadableTextColor(actionBg)
        : '#111827';

      if (!action) {
        if (!isEditable) {
          return <div className="h-full" />;
        }
        return (
          <div
            onClick={() => onAddAction(subGoal.id, actionInfo.actionPos)}
            onDragOver={onActionDrop ? allowDrop : undefined}
            onDrop={
              onActionDrop
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onActionDrop(subGoal.id, actionInfo.actionPos);
                  }
                : undefined
            }
            className="bg-blue-50 border border-blue-200 p-1 cursor-pointer hover:bg-blue-100 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 h-full"
          >
            +
          </div>
        );
      }

      return (
        <div
          onClick={() => onActionClick(action)}
          onContextMenu={isEditable ? (e) => {
            e.preventDefault();
            onUpdateAction?.(action);
          } : undefined}
          draggable={isEditable ? Boolean(onActionDragStart) : false}
          onDragStart={isEditable ? (e) => {
            if (!onActionDragStart) return;
            e.dataTransfer.effectAllowed = 'move';
            onActionDragStart(subGoal.id, action);
          } : undefined}
          onDragEnd={isEditable ? () => { onActionDragEnd?.(); } : undefined}
          onDragOver={isEditable ? (onActionDrop ? allowDrop : undefined) : undefined}
          onDrop={isEditable ? (
            onActionDrop
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onActionDrop(subGoal.id, actionInfo.actionPos);
                }
              : undefined
          ) : undefined}
          className={`border rounded p-1 ${gridAspect === 'rectangle' ? 'text-sm' : 'text-xs'} h-full flex items-center justify-center ${isEditable ? 'cursor-pointer hover:opacity-90' : ''}`}
          style={{
            backgroundColor: actionBg,
            borderColor: actionColorSettings.inherit ? parentColor : '#d1d5db',
            color: actionTextColor,
          }}
          title={isEditable ? action.title + t('fullGrid.rightClickToEdit') : action.title}
        >
          <div className={`text-center break-words ${gridAspect === 'rectangle' ? 'text-sm' : ''}`}>{action.title}</div>
        </div>
      );
    }

    if (!isEditable) return <div className="h-full" />;
    return <div className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 h-full"></div>;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
      <div className="overflow-x-auto">
        <div
          className={`grid grid-cols-9 gap-1 min-w-[540px] sm:min-w-0 ${gridAspect === 'square' ? 'max-w-5xl' : ''} mx-auto`}
          style={isEditable ? { gridAutoRows: '1fr' } : undefined}
        >
        {Array.from({ length: 9 }, (_, row) =>
          Array.from({ length: 9 }, (_, col) => {
            // Skip rendering cells that are part of the center 3x3 (except the main one)
            if (row >= 3 && row <= 5 && col >= 3 && col <= 5) {
              if (row === 3 && col === 3) {
                return renderCenterCell();
              }
              return null;
            }

            const filled = isEditable || isCellFilled(row, col);
            return (
              <div key={`${row}-${col}`} className={filled ? (gridAspect === 'square' ? 'aspect-square' : 'aspect-[5/3]') : ''}>
                {renderCell(row, col)}
              </div>
            );
          })
        )}
        </div>
      </div>

      {isEditable && (
        <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400 print-hidden">
          <p>{t('fullGrid.footer')}</p>
        </div>
      )}
    </div>
  );
}
