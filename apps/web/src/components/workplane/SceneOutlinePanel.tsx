"use client";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Box,
  ChevronRight,
  CircleDot,
  Cog,
  Cone,
  Cylinder,
  Donut,
  Eye,
  EyeOff,
  FileBox,
  Gem,
  Globe,
  Group,
  Hexagon,
  Image as ImageIcon,
  Lock,
  LockOpen,
  PenTool,
  Pyramid,
  Rotate3d,
  Search,
  Shapes,
  Spline,
  SquaresIntersect,
  Tent,
  Torus,
  TriangleRight,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslations, type Translator } from "@/i18n";
import {
  OUTLINE_NAME_MAX_LENGTH,
  buildOutlineRows,
  outlineItemType,
  outlineItemTypeLabel,
  outlineRangeIds,
  outlineRenameValue,
  outlineSearchMatcher,
  type OutlineItemType,
  type OutlineRow,
} from "@/lib/sceneOutline";
import { shapeDisplayName } from "@/lib/shapeDisplayNames";
import type { WorkplaneShape } from "@/types/sketchforge";

export const SCENE_OUTLINE_MIN_WIDTH = 200;
export const SCENE_OUTLINE_MAX_WIDTH = 480;
export const SCENE_OUTLINE_DEFAULT_WIDTH = 260;

const TYPE_ICONS: Record<OutlineItemType, LucideIcon> = {
  box: Box,
  cylinder: Cylinder,
  sphere: Globe,
  halfSphere: Globe,
  cone: Cone,
  pyramid: Pyramid,
  roof: Tent,
  roundRoof: Tent,
  wedge: TriangleRight,
  text: Type,
  torus: Torus,
  tube: CircleDot,
  ring: Donut,
  gear: Cog,
  polygon: Hexagon,
  icosahedron: Gem,
  scribble: Spline,
  sketch: PenTool,
  mesh: Shapes,
  group: Group,
  intersection: SquaresIntersect,
  sketchExtrusion: PenTool,
  sketchRevolve: Rotate3d,
  image: ImageIcon,
  imported: FileBox,
};

/** Commands of the right-click menu; except Rename they act on the selection, as the toolbar does. */
export type SceneOutlineCommands = {
  canGroup: boolean;
  canUngroup: boolean;
  /** Every selected shape is hidden / locked / a hole: the menu offers the opposite. */
  selectionHidden: boolean;
  selectionLocked: boolean;
  selectionHoles: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
  onToggleLocked: () => void;
  onSetHole: (hole: boolean) => void;
  onGroup: () => void;
  onUngroup: () => void;
};

type SceneOutlinePanelProps = {
  shapes: readonly WorkplaneShape[];
  selectedIds: readonly string[];
  width: number;
  /** While set (e.g. the edge tool is open) the list only shows the design and says why. */
  busyMessage: string | null;
  commands: SceneOutlineCommands;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  onSelect: (ids: string[], mode: "replace" | "toggle") => void;
  onHighlight: (ids: readonly string[]) => void;
  onToggleShapeHidden: (id: string) => void;
  onToggleShapeLocked: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onShowAllHidden: () => void;
  onFocusShapes: (ids: readonly string[]) => void;
};

type MenuState = { x: number; y: number; rowKey: string; byKeyboard: boolean };

const isMacPlatform = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

function shortcutLabel(key: string, { mod = false, shift = false } = {}) {
  if (isMacPlatform()) return `${mod ? "⌘" : ""}${shift ? "⇧" : ""}${key}`;
  return [mod ? "Ctrl" : "", shift ? "Shift" : "", key].filter(Boolean).join("+");
}

function clampWidth(width: number) {
  return Math.round(Math.min(SCENE_OUTLINE_MAX_WIDTH, Math.max(SCENE_OUTLINE_MIN_WIDTH, width)));
}

type EditingState = { key: string; byKeyboard: boolean };

export function SceneOutlinePanel({
  shapes,
  selectedIds,
  width,
  busyMessage,
  commands,
  onWidthChange,
  onClose,
  onSelect,
  onHighlight,
  onToggleShapeHidden,
  onToggleShapeLocked,
  onRename,
  onShowAllHidden,
  onFocusShapes,
}: SceneOutlinePanelProps) {
  const t = useTranslations();
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const anchorIdRef = useRef<string | null>(null);
  const hoveredKeyRef = useRef<string | null>(null);
  const lastActiveIndexRef = useRef(0);
  const treeRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Keyboard focus is in the tree; mouse clicks never put it there. */
  const treeFocusWithinRef = useRef(false);
  /** A key pressed in the tree went on to an editor command (Delete, Ctrl+D…); keep the focus in the tree afterwards. */
  const keepFocusAfterCommandRef = useRef(false);
  const busy = busyMessage !== null;

  const matcher = useMemo(() => outlineSearchMatcher(t, query), [query, t]);
  const rows = useMemo(() => buildOutlineRows(shapes, expandedKeys, matcher), [expandedKeys, matcher, shapes]);
  const rowIndexByKey = useMemo(() => new Map(rows.map((row, index) => [row.key, index])), [rows]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hiddenCount = useMemo(() => shapes.filter((shape) => shape.hidden).length, [shapes]);
  // Roving tabindex: the remembered row while it is listed; if it was deleted, the row now in its place.
  const activeKey = focusedKey !== null && rowIndexByKey.has(focusedKey)
    ? focusedKey
    : focusedKey !== null
      ? rows[Math.min(lastActiveIndexRef.current, rows.length - 1)]?.key ?? null
      : rows.find((row) => row.level === 1 && selectedSet.has(row.id))?.key ?? rows[0]?.key ?? null;
  const activeIndex = activeKey === null ? -1 : rowIndexByKey.get(activeKey) ?? -1;
  if (activeIndex >= 0) lastActiveIndexRef.current = activeIndex;

  const rowElement = useCallback((key: string) => treeRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(key)}"]`) ?? null, []);

  const highlight = useCallback((key: string | null) => {
    if (hoveredKeyRef.current === key) return;
    hoveredKeyRef.current = key;
    const row = key === null ? undefined : rows[rowIndexByKey.get(key) ?? -1];
    // Group parts have no position of their own in the design, so their whole group is outlined.
    onHighlight(row ? [row.topLevelId] : []);
  }, [onHighlight, rowIndexByKey, rows]);

  useEffect(() => () => onHighlight([]), [onHighlight]);
  useEffect(() => {
    if (busy) highlight(null);
  }, [busy, highlight]);

  // After Delete or another command from the keyboard the focused row may be gone: focus the row now in its place.
  useLayoutEffect(() => {
    if (!keepFocusAfterCommandRef.current || activeKey === null) return;
    keepFocusAfterCommandRef.current = false;
    if (!document.activeElement || document.activeElement === document.body) rowElement(activeKey)?.focus({ preventScroll: true });
  }, [activeKey, rowElement, rows]);

  // A shape selected in the 3D view scrolls into sight here. Only a new selection scrolls, not a changed list.
  const firstSelectedId = selectedIds[0];
  useEffect(() => {
    if (!firstSelectedId) return;
    const key = rows.find((entry) => entry.level === 1 && entry.id === firstSelectedId)?.key;
    if (!key) return;
    if (!treeFocusWithinRef.current) setFocusedKey(key);
    rowElement(key)?.scrollIntoView({ block: "nearest" });
  }, [firstSelectedId]);

  const selectRow = useCallback((row: OutlineRow, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    if (event.shiftKey) {
      onSelect(outlineRangeIds(rows, anchorIdRef.current ?? selectedIds[0] ?? null, row.topLevelId), "replace");
      return;
    }
    anchorIdRef.current = row.topLevelId;
    onSelect([row.topLevelId], event.ctrlKey || event.metaKey ? "toggle" : "replace");
  }, [onSelect, rows, selectedIds]);

  const toggleExpanded = useCallback((key: string, expand?: boolean) => {
    setExpandedKeys((current) => {
      const open = expand ?? !current.has(key);
      if (open === current.has(key)) return current;
      const next = new Set(current);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const startRename = useCallback((key: string, byKeyboard: boolean) => {
    if (busy) return;
    setMenu(null);
    setFocusedKey(key);
    setEditing({ key, byKeyboard });
  }, [busy]);

  const finishRename = useCallback((key: string, typed: string | null, byEnterOrEscape: boolean) => {
    const row = rows[rowIndexByKey.get(key) ?? -1];
    const byKeyboard = editing?.byKeyboard ?? false;
    setEditing(null);
    if (row && typed !== null) {
      const name = outlineRenameValue(typed, shapeDisplayName(t, row.shape.name));
      if (name !== null) onRename(row.id, name);
    }
    if (!byEnterOrEscape) return;
    // Back to where the rename started: the row for keyboard users, the 3D view's shortcuts for mouse users.
    window.requestAnimationFrame(() => {
      if (byKeyboard) rowElement(key)?.focus({ preventScroll: true });
      else if (document.activeElement instanceof HTMLElement && treeRef.current?.contains(document.activeElement)) document.activeElement.blur();
    });
  }, [editing?.byKeyboard, onRename, rowElement, rowIndexByKey, rows, t]);

  const openMenu = useCallback((row: OutlineRow, x: number, y: number, byKeyboard: boolean) => {
    if (busy) return;
    if (!selectedSet.has(row.topLevelId)) {
      anchorIdRef.current = row.topLevelId;
      onSelect([row.topLevelId], "replace");
    }
    setFocusedKey(row.key);
    setMenu({ x, y, rowKey: row.key, byKeyboard });
  }, [busy, onSelect, selectedSet]);

  const closeMenu = useCallback((returnFocus: boolean) => {
    setMenu((current) => {
      if (current && returnFocus) window.requestAnimationFrame(() => rowElement(current.rowKey)?.focus({ preventScroll: true }));
      return null;
    });
  }, [rowElement]);

  const rowFromEvent = (event: { target: EventTarget }) => {
    const key = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-row-key]")?.dataset.rowKey : undefined;
    const index = key === undefined ? undefined : rowIndexByKey.get(key);
    return index === undefined ? null : rows[index];
  };
  const actionFromEvent = (event: { target: EventTarget }) =>
    event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action]")?.dataset.action ?? null : null;

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || treeFocusWithinRef.current) return;
    // A mouse click selects without taking keyboard focus, so arrow keys keep moving the shape in the 3D view.
    event.preventDefault();
    if (document.activeElement === searchRef.current) searchRef.current?.blur();
  };

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) return;
    const row = rowFromEvent(event);
    const action = actionFromEvent(event);
    // While busy the list can still be browsed, nothing else.
    if (busy && action !== "toggle-expand") return;
    if (!row) {
      if (event.target === event.currentTarget) onSelect([], "replace");
      return;
    }
    if (action === "toggle-expand") toggleExpanded(row.key);
    else if (action === "toggle-hidden") onToggleShapeHidden(row.id);
    else if (action === "toggle-locked") onToggleShapeLocked(row.id);
    else if (editing?.key !== row.key) {
      setFocusedKey(row.key);
      selectRow(row, event);
    }
  };

  const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const row = rowFromEvent(event);
    if (row && !actionFromEvent(event) && !(event.target instanceof HTMLInputElement)) startRename(row.key, false);
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) return;
    event.preventDefault();
    const row = rowFromEvent(event);
    if (row) openMenu(row, event.clientX, event.clientY, false);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (busy || event.pointerType === "touch") return;
    highlight(rowFromEvent(event)?.key ?? null);
  };

  const moveFocus = (index: number, event: ReactKeyboardEvent, select: boolean) => {
    const row = rows[Math.min(rows.length - 1, Math.max(0, index))];
    if (!row) return;
    setFocusedKey(row.key);
    const element = rowElement(row.key);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest" });
    if (select && !busy && !event.ctrlKey && !event.metaKey) selectRow(row, { ctrlKey: false, metaKey: false, shiftKey: event.shiftKey });
  };

  const openRowMenuFromKeyboard = (row: OutlineRow) => {
    const bounds = rowElement(row.key)?.getBoundingClientRect();
    openMenu(row, bounds ? bounds.left + 32 : 0, bounds ? bounds.bottom : 0, true);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || event.altKey) return;
    const row = rows[activeIndex];
    if (!row) return;
    const handled = () => {
      event.preventDefault();
      // The editor's arrow-key moves must not also act on the 3D view.
      event.stopPropagation();
    };
    switch (event.key) {
      case "ArrowDown":
        handled();
        moveFocus(activeIndex + 1, event, true);
        return;
      case "ArrowUp":
        handled();
        moveFocus(activeIndex - 1, event, true);
        return;
      case "Home":
        handled();
        moveFocus(0, event, true);
        return;
      case "End":
        handled();
        moveFocus(rows.length - 1, event, true);
        return;
      case "ArrowRight":
        handled();
        if (row.childCount > 0 && !row.expanded) toggleExpanded(row.key, true);
        else if (row.expanded) moveFocus(activeIndex + 1, event, false);
        return;
      case "ArrowLeft":
        handled();
        if (row.expanded) toggleExpanded(row.key, false);
        else if (row.parentKey !== null) moveFocus(rowIndexByKey.get(row.parentKey) ?? activeIndex, event, false);
        return;
      case " ":
      case "Enter":
        handled();
        if (!busy) selectRow(row, { ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey });
        return;
      case "F2":
        handled();
        startRename(row.key, true);
        return;
      case "ContextMenu":
        handled();
        openRowMenuFromKeyboard(row);
        return;
      case "F10":
        if (event.shiftKey) {
          handled();
          openRowMenuFromKeyboard(row);
          return;
        }
        break;
      default:
        break;
    }
    // Delete, Ctrl+D, Ctrl+H and the other editor shortcuts act on the selection as usual.
    keepFocusAfterCommandRef.current = true;
    window.requestAnimationFrame(() => {
      keepFocusAfterCommandRef.current = false;
    });
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
    } else if (event.key === "ArrowDown" && activeKey !== null) {
      event.preventDefault();
      setFocusedKey(activeKey);
      rowElement(activeKey)?.focus();
    }
  };

  const menuRow = menu ? rows[rowIndexByKey.get(menu.rowKey) ?? -1] : undefined;
  const editingRowListed = editing !== null && rowIndexByKey.has(editing.key);
  useEffect(() => {
    if (menu && !menuRow) setMenu(null);
    if (editing && !editingRowListed) setEditing(null);
  }, [editing, editingRowListed, menu, menuRow]);

  return (
    <aside
      className={`scene-outline ${busy ? "busy" : ""}`}
      style={{ "--scene-outline-width": `${width}px` } as CSSProperties}
      aria-labelledby={titleId}
    >
      <header className="scene-outline-header">
        <h2 id={titleId}>{t("panels.outline.title")}</h2>
        <span className="scene-outline-count" title={t("panels.outline.count", { count: shapes.length })}>{shapes.length}</span>
        {hiddenCount > 0 ? (
          // In the header, so the rows do not move under the pointer when the first shape is hidden.
          <button
            type="button"
            className="scene-outline-show-all"
            disabled={busy}
            aria-label={t("editor.toolbar.showAllHidden", { count: hiddenCount })}
            title={t("editor.toolbar.showAllHidden", { count: hiddenCount })}
            onClick={onShowAllHidden}
          >
            <EyeOff size={16} strokeWidth={2.2} aria-hidden="true" />
            <span aria-hidden="true">{hiddenCount}</span>
          </button>
        ) : null}
        <button type="button" className="scene-outline-icon-button" aria-label={t("panels.outline.close")} title={t("panels.outline.close")} onClick={onClose}>
          <X size={18} strokeWidth={2.3} aria-hidden="true" />
        </button>
      </header>
      <div className="scene-outline-tools">
        <label className="scene-outline-search">
          <Search size={16} strokeWidth={2.2} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={t("panels.outline.searchPlaceholder")}
            aria-label={t("panels.outline.search")}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {query ? (
            <button
              type="button"
              className="scene-outline-icon-button"
              aria-label={t("panels.outline.clearSearch")}
              title={t("panels.outline.clearSearch")}
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              <X size={15} strokeWidth={2.3} aria-hidden="true" />
            </button>
          ) : null}
        </label>
      </div>
      {busyMessage ? <p className="scene-outline-busy" role="status">{busyMessage}</p> : null}
      {shapes.length === 0 ? (
        <p className="scene-outline-empty">{t("panels.outline.empty")}</p>
      ) : rows.length === 0 ? (
        <p className="scene-outline-empty" role="status">{t("panels.outline.noMatches", { query: query.trim() })}</p>
      ) : (
        <div
          ref={treeRef}
          className="scene-outline-tree"
          role="tree"
          aria-label={t("panels.outline.tree")}
          aria-multiselectable="true"
          aria-disabled={busy || undefined}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => highlight(null)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            treeFocusWithinRef.current = true;
          }}
          onBlur={() => {
            // The next focused element is known only after the event, and is null when focus goes to the page.
            window.requestAnimationFrame(() => {
              treeFocusWithinRef.current = Boolean(treeRef.current?.contains(document.activeElement));
            });
          }}
        >
          {rows.map((row, index) => (
            <OutlineRowView
              key={row.key}
              rowKey={row.key}
              level={row.level}
              posInSet={row.posInSet}
              setSize={row.setSize}
              childCount={row.childCount}
              expanded={row.expanded}
              name={shapeDisplayName(t, row.shape.name)}
              typeLabel={outlineItemTypeLabel(t, row.shape)}
              type={outlineItemType(row.shape)}
              color={row.shape.color}
              hole={Boolean(row.shape.hole)}
              hidden={Boolean(row.shape.hidden)}
              locked={Boolean(row.shape.locked)}
              selected={row.level === 1 && selectedSet.has(row.id)}
              inSelectedGroup={row.level > 1 && selectedSet.has(row.topLevelId)}
              tabbable={index === activeIndex}
              editing={editing?.key === row.key}
              busy={busy}
              t={t}
              onFinishRename={finishRename}
            />
          ))}
        </div>
      )}
      {menu && menuRow ? (
        <OutlineContextMenu
          menu={menu}
          rowName={shapeDisplayName(t, menuRow.shape.name)}
          t={t}
          commands={commands}
          onRename={() => startRename(menuRow.key, menu.byKeyboard)}
          onZoom={() => onFocusShapes(selectedIds.length ? selectedIds : [menuRow.topLevelId])}
          onClose={closeMenu}
        />
      ) : null}
      <div
        className="scene-outline-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("panels.outline.resize")}
        aria-valuemin={SCENE_OUTLINE_MIN_WIDTH}
        aria-valuemax={SCENE_OUTLINE_MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          const startX = event.clientX;
          const startWidth = width;
          const handle = event.currentTarget;
          handle.setPointerCapture(event.pointerId);
          const move = (moveEvent: PointerEvent) => onWidthChange(clampWidth(startWidth + moveEvent.clientX - startX));
          const end = () => {
            handle.removeEventListener("pointermove", move);
            handle.removeEventListener("pointerup", end);
            handle.removeEventListener("pointercancel", end);
          };
          handle.addEventListener("pointermove", move);
          handle.addEventListener("pointerup", end);
          handle.addEventListener("pointercancel", end);
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 48 : 16;
          const next = event.key === "ArrowLeft" ? width - step
            : event.key === "ArrowRight" ? width + step
              : event.key === "Home" ? SCENE_OUTLINE_MIN_WIDTH
                : event.key === "End" ? SCENE_OUTLINE_MAX_WIDTH
                  : null;
          if (next === null) return;
          event.preventDefault();
          event.stopPropagation();
          onWidthChange(clampWidth(next));
        }}
      />
    </aside>
  );
}

type OutlineRowViewProps = {
  rowKey: string;
  level: number;
  posInSet: number;
  setSize: number;
  childCount: number;
  expanded: boolean;
  name: string;
  typeLabel: string;
  type: OutlineItemType;
  color: string;
  hole: boolean;
  hidden: boolean;
  locked: boolean;
  selected: boolean;
  inSelectedGroup: boolean;
  tabbable: boolean;
  editing: boolean;
  busy: boolean;
  t: Translator;
  onFinishRename: (key: string, typed: string | null, byEnterOrEscape: boolean) => void;
};

/** One row. Takes plain values so a changed design re-renders only the rows that look different. */
const OutlineRowView = memo(function OutlineRowView({
  rowKey,
  level,
  posInSet,
  setSize,
  childCount,
  expanded,
  name,
  typeLabel,
  type,
  color,
  hole,
  hidden,
  locked,
  selected,
  inSelectedGroup,
  tabbable,
  editing,
  busy,
  t,
  onFinishRename,
}: OutlineRowViewProps) {
  const TypeIcon = TYPE_ICONS[type] ?? Shapes;
  const topLevel = level === 1;
  const states = [
    hole ? t("panels.outline.state.hole") : null,
    hidden ? t("panels.outline.state.hidden") : null,
    locked ? t("panels.outline.state.locked") : null,
  ].filter((state): state is string => state !== null);
  const tooltip = topLevel ? `${name} · ${typeLabel}` : `${name} · ${typeLabel}\n${t("panels.outline.partHint")}`;
  const doneRef = useRef(false);

  return (
    <div
      role="treeitem"
      data-row-key={rowKey}
      className={[
        "scene-outline-row",
        selected ? "selected" : "",
        inSelectedGroup ? "in-selection" : "",
        hidden ? "is-hidden" : "",
        topLevel ? "" : "is-part",
      ].filter(Boolean).join(" ")}
      style={{ "--outline-level": level - 1 } as CSSProperties}
      aria-level={level}
      aria-posinset={posInSet}
      aria-setsize={setSize}
      aria-expanded={childCount > 0 ? expanded : undefined}
      aria-selected={topLevel ? selected : inSelectedGroup}
      aria-label={[name, typeLabel, ...states].join(", ")}
      tabIndex={tabbable ? 0 : -1}
    >
      {childCount > 0 ? (
        <button
          type="button"
          className={`scene-outline-chevron ${expanded ? "expanded" : ""}`}
          data-action="toggle-expand"
          tabIndex={-1}
          aria-label={t(expanded ? "panels.outline.collapse" : "panels.outline.expand", { name })}
          title={t(expanded ? "panels.outline.collapse" : "panels.outline.expand", { name })}
        >
          <ChevronRight size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
      ) : (
        <span className="scene-outline-chevron-spacer" aria-hidden="true" />
      )}
      <span className={`scene-outline-swatch ${hole ? "hole" : ""}`} style={hole ? undefined : ({ "--swatch": color } as CSSProperties)} aria-hidden="true" />
      <TypeIcon className="scene-outline-type-icon" size={16} strokeWidth={2} aria-hidden="true" />
      {editing ? (
        <input
          className="scene-outline-rename"
          defaultValue={name}
          maxLength={OUTLINE_NAME_MAX_LENGTH}
          aria-label={t("panels.outline.renameInput", { name })}
          autoFocus
          onFocus={(event) => {
            doneRef.current = false;
            event.currentTarget.select();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            doneRef.current = true;
            onFinishRename(rowKey, event.key === "Enter" ? event.currentTarget.value : null, true);
          }}
          onBlur={(event) => {
            if (!doneRef.current) onFinishRename(rowKey, event.currentTarget.value, false);
          }}
        />
      ) : (
        <span className="scene-outline-name" title={tooltip}>{name}</span>
      )}
      {topLevel ? (
        <>
          <button
            type="button"
            className={`scene-outline-toggle ${locked ? "on" : ""}`}
            data-action="toggle-locked"
            tabIndex={-1}
            disabled={busy}
            aria-pressed={locked}
            aria-label={t(locked ? "panels.outline.unlock" : "panels.outline.lock", { name })}
            title={t(locked ? "panels.outline.unlock" : "panels.outline.lock", { name })}
          >
            {locked ? <Lock size={15} strokeWidth={2.3} aria-hidden="true" /> : <LockOpen size={15} strokeWidth={2.3} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={`scene-outline-toggle ${hidden ? "on" : ""}`}
            data-action="toggle-hidden"
            tabIndex={-1}
            disabled={busy}
            aria-pressed={hidden}
            aria-label={t(hidden ? "panels.outline.show" : "panels.outline.hide", { name })}
            title={t(hidden ? "panels.outline.show" : "panels.outline.hide", { name })}
          >
            {hidden ? <EyeOff size={15} strokeWidth={2.3} aria-hidden="true" /> : <Eye size={15} strokeWidth={2.3} aria-hidden="true" />}
          </button>
        </>
      ) : hidden ? (
        <EyeOff className="scene-outline-part-state" size={15} strokeWidth={2.3} aria-hidden="true" />
      ) : null}
    </div>
  );
});

type MenuItem = { id: string; label: string; shortcut?: string; disabled?: boolean; title?: string; run: () => void } | "separator";

type OutlineContextMenuProps = {
  menu: MenuState;
  rowName: string;
  t: Translator;
  commands: SceneOutlineCommands;
  onRename: () => void;
  onZoom: () => void;
  onClose: (returnFocus: boolean) => void;
};

function OutlineContextMenu({ menu, rowName, t, commands, onRename, onZoom, onClose }: OutlineContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });
  const items: MenuItem[] = [
    { id: "rename", label: t("panels.outline.menu.rename"), shortcut: "F2", run: onRename },
    { id: "zoom", label: t("panels.outline.menu.zoomTo"), run: onZoom },
    "separator",
    { id: "duplicate", label: t("editor.toolbar.duplicate"), shortcut: shortcutLabel("D", { mod: true }), run: commands.onDuplicate },
    { id: "delete", label: t("editor.toolbar.delete"), shortcut: isMacPlatform() ? "⌫" : "Del", run: commands.onDelete },
    "separator",
    {
      id: "hidden",
      label: t(commands.selectionHidden ? "editor.toolbar.showSelected" : "editor.toolbar.hideSelected"),
      shortcut: shortcutLabel("H", { mod: true }),
      run: commands.onToggleHidden,
    },
    {
      id: "locked",
      label: t(commands.selectionLocked ? "panels.outline.menu.unlock" : "panels.outline.menu.lock"),
      shortcut: shortcutLabel("L", { mod: true }),
      run: commands.onToggleLocked,
    },
    {
      id: "hole",
      label: t(commands.selectionHoles ? "panels.outline.menu.makeSolid" : "panels.outline.menu.makeHole"),
      shortcut: commands.selectionHoles ? "S" : "H",
      disabled: commands.selectionLocked,
      title: commands.selectionLocked ? t("panels.outline.menu.unlockFirst") : undefined,
      run: () => commands.onSetHole(!commands.selectionHoles),
    },
    "separator",
    { id: "group", label: t("editor.toolbar.group"), shortcut: shortcutLabel("G", { mod: true }), disabled: !commands.canGroup, run: commands.onGroup },
    { id: "ungroup", label: t("editor.toolbar.ungroup"), shortcut: shortcutLabel("G", { mod: true, shift: true }), disabled: !commands.canUngroup, run: commands.onUngroup },
  ];

  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    setPosition({
      left: Math.max(4, Math.min(menu.x, window.innerWidth - bounds.width - 4)),
      top: Math.max(4, Math.min(menu.y, window.innerHeight - bounds.height - 4)),
    });
    element.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [menu.x, menu.y]);

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose(false);
    };
    const close = () => onClose(false);
    document.addEventListener("pointerdown", closeOnOutside, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);

  const enabledItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = enabledItems();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) => list[(next + list.length) % list.length]?.focus();
    if (event.key === "ArrowDown") focusAt(index + 1);
    else if (event.key === "ArrowUp") focusAt(index - 1);
    else if (event.key === "Home") focusAt(0);
    else if (event.key === "End") focusAt(list.length - 1);
    else if (event.key === "Escape") onClose(true);
    else if (event.key === "Tab") onClose(false);
    else return;
    if (event.key !== "Tab") event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={menuRef}
      className="scene-outline-menu"
      role="menu"
      aria-label={t("panels.outline.menu.label", { name: rowName })}
      style={position}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) => item === "separator" ? (
        <div key={`separator-${index}`} className="scene-outline-menu-separator" role="separator" />
      ) : (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          tabIndex={-1}
          aria-disabled={item.disabled || undefined}
          title={item.title}
          className="scene-outline-menu-item"
          onClick={() => {
            if (item.disabled) return;
            const rename = item.id === "rename";
            onClose(!rename && menu.byKeyboard);
            item.run();
          }}
        >
          <span>{item.label}</span>
          {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
        </button>
      ))}
    </div>
  );
}
