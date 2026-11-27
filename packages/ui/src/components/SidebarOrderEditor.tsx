/**
 * SidebarOrderEditor - Lista reordenable (arrastrando o con flechas) para elegir qué elementos muestra la barra lateral y en qué orden
 */

import React, { useState } from 'react';
import { SIDEBAR_ITEMS, type SidebarItemId } from '../sidebarLayout';
import './SidebarOrderEditor.css';

/** Clave de `platformPreferences` que guarda si cada elemento se muestra */
export const SIDEBAR_VISIBILITY_KEYS: Partial<Record<SidebarItemId, string>> = {
  dashboard: 'showDashboard',
  'post-helper': 'showPostHelper',
  'password-manager': 'showPasswordManager',
  'mail-manager': 'showMailManager',
  'character-hub': 'showCharacterHub',
  freedcamp: 'showFreedcamp',
};

interface SidebarOrderEditorProps {
  order: SidebarItemId[];
  visibility: Partial<Record<SidebarItemId, boolean>>;
  onOrderChange: (order: SidebarItemId[]) => void;
  onVisibilityChange: (id: SidebarItemId, visible: boolean) => void;
}

export default function SidebarOrderEditor({ order, visibility, onOrderChange, onVisibilityChange }: SidebarOrderEditorProps) {
  const [draggedId, setDraggedId] = useState<SidebarItemId | null>(null);
  const [dragOverId, setDragOverId] = useState<SidebarItemId | null>(null);
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after' | null>(null);

  const info = (id: SidebarItemId) => SIDEBAR_ITEMS.find((item) => item.id === id)!;

  const resetDrag = () => {
    setDraggedId(null);
    setDragOverId(null);
    setDragOverPos(null);
  };

  const handleDragStart = (e: React.DragEvent, id: SidebarItemId) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: SidebarItemId) => {
    if (!draggedId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId === id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOverId(id);
    setDragOverPos(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
  };

  const handleDragLeave = (e: React.DragEvent, id: SidebarItemId) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverId((prev) => (prev === id ? null : prev));
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: SidebarItemId) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') as SidebarItemId;
    if (sourceId && sourceId !== targetId && order.includes(sourceId)) {
      const next = order.filter((id) => id !== sourceId);
      const targetIndex = next.indexOf(targetId);
      next.splice(dragOverPos === 'after' ? targetIndex + 1 : targetIndex, 0, sourceId);
      onOrderChange(next);
    }
    resetDrag();
  };

  const foldersIndex = order.indexOf('folders');

  return (
    <ul className="soe-list">
      {order.map((id, index) => {
        const item = info(id);
        const visible = item.hideable ? visibility[id] ?? false : true;
        const where = index < foldersIndex ? 'Top' : index > foldersIndex ? 'Bottom' : null;
        const showIndicator = dragOverId === id && draggedId !== id;
        return (
          <React.Fragment key={id}>
            {showIndicator && dragOverPos === 'before' && <li className="soe-drop-indicator" aria-hidden="true" />}
            <li
              className={`soe-row${draggedId === id ? ' soe-row-dragging' : ''}${visible ? '' : ' soe-row-hidden'}`}
              draggable
              onDragStart={(e) => handleDragStart(e, id)}
              onDragOver={(e) => handleDragOver(e, id)}
              onDragLeave={(e) => handleDragLeave(e, id)}
              onDrop={(e) => handleDrop(e, id)}
              onDragEnd={resetDrag}
            >
              <span className="soe-handle" aria-hidden="true">⠿</span>
              <span className="soe-label">{item.label}</span>
              {where && <span className="soe-where">{where}</span>}
              {item.hideable ? (
                <label className="soe-toggle">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(e) => onVisibilityChange(id, e.target.checked)}
                  />
                  <span>Show</span>
                </label>
              ) : (
                <span className="soe-fixed">Always visible</span>
              )}
            </li>
            {showIndicator && dragOverPos === 'after' && <li className="soe-drop-indicator" aria-hidden="true" />}
          </React.Fragment>
        );
      })}
    </ul>
  );
}
