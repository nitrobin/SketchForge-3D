import type { Translator } from "@/i18n";
import { shapeDisplayName } from "@/lib/shapeDisplayNames";
import type { ShapeKind, WorkplaneShape } from "@/types/sketchforge";

/** What a row in the shape list shows the object as: its primitive kind, or how it was made. */
export type OutlineItemType = ShapeKind | "group" | "intersection" | "sketchExtrusion" | "sketchRevolve" | "image" | "imported";

export function outlineItemType(shape: WorkplaneShape): OutlineItemType {
  if (shape.groupedShapes?.length) return shape.groupOperation === "intersection" ? "intersection" : "group";
  if (shape.sketchProfile) return shape.sketchOperation === "revolve" ? "sketchRevolve" : "sketchExtrusion";
  if (shape.imagePlate) return "image";
  if (shape.importedMesh && shape.importedMesh.sourceFormat !== "json") return "imported";
  return shape.kind;
}

export function outlineItemTypeLabel(t: Translator, shape: WorkplaneShape): string {
  const type = outlineItemType(shape);
  switch (type) {
    case "group":
      return t("common.shapeName.group");
    case "intersection":
      return t("common.shapeName.intersection");
    case "sketchExtrusion":
      return t("common.shapeName.sketchExtrusion");
    case "sketchRevolve":
      return t("common.shapeName.sketchRevolve");
    case "image":
      return t("common.shapeName.sketchImage");
    case "imported":
      return t("panels.outline.type.imported", { format: (shape.importedMesh?.sourceFormat ?? "").toUpperCase() });
    default:
      return t(`common.shape.${type}`);
  }
}

export type OutlineRow = {
  /** Ids from the top-level shape down to this one: unique even if a group repeats an id. */
  key: string;
  id: string;
  /** The shape the editor selects for this row: group parts select their whole group. */
  topLevelId: string;
  parentKey: string | null;
  /** 1-based, as aria-level. */
  level: number;
  posInSet: number;
  setSize: number;
  shape: WorkplaneShape;
  childCount: number;
  expanded: boolean;
};

/**
 * The rows the list shows, top to bottom. With `matches`, a shape stays when it or a part inside it
 * matches; a group that matches only through its parts opens to show them, and everything inside
 * a matching shape is listed as usual.
 */
export function buildOutlineRows(
  shapes: readonly WorkplaneShape[],
  expandedKeys: ReadonlySet<string>,
  matches?: (shape: WorkplaneShape) => boolean,
): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const containsMatch = new Map<WorkplaneShape, boolean>();
  const hasMatch = (shape: WorkplaneShape): boolean => {
    if (!matches) return true;
    const cached = containsMatch.get(shape);
    if (cached !== undefined) return cached;
    const result = matches(shape) || (shape.groupedShapes ?? []).some(hasMatch);
    containsMatch.set(shape, result);
    return result;
  };
  const visit = (siblings: readonly WorkplaneShape[], parentKey: string | null, topLevelId: string | null, level: number, filtering: boolean) => {
    const shown = filtering ? siblings.filter(hasMatch) : siblings;
    shown.forEach((shape, index) => {
      const key = parentKey === null ? shape.id : `${parentKey}/${shape.id}`;
      const children = shape.groupedShapes ?? [];
      // Inside a shape that matches by itself every part is shown; otherwise only the matching branch.
      const filterChildren = filtering && !matches?.(shape);
      const expanded = children.length > 0 && (expandedKeys.has(key) || (filterChildren && children.some(hasMatch)));
      rows.push({
        key,
        id: shape.id,
        topLevelId: topLevelId ?? shape.id,
        parentKey,
        level,
        posInSet: index + 1,
        setSize: shown.length,
        shape,
        childCount: children.length,
        expanded,
      });
      if (expanded) visit(children, key, topLevelId ?? shape.id, level + 1, filterChildren);
    });
  };
  visit(shapes, null, null, 1, Boolean(matches));
  return rows;
}

/** Case-insensitive search over the stored name, the name as shown, the type and the solid/hole, hidden and locked state. */
export function outlineSearchMatcher(t: Translator, query: string): ((shape: WorkplaneShape) => boolean) | undefined {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return undefined;
  const holeLabel = t("panels.outline.state.hole").toLocaleLowerCase();
  const hiddenLabel = t("panels.outline.state.hidden").toLocaleLowerCase();
  const lockedLabel = t("panels.outline.state.locked").toLocaleLowerCase();
  return (shape) => {
    const texts = [shape.name, shapeDisplayName(t, shape.name), outlineItemTypeLabel(t, shape)];
    if (shape.hole) texts.push(holeLabel);
    if (shape.hidden) texts.push(hiddenLabel);
    if (shape.locked) texts.push(lockedLabel);
    return texts.some((text) => text.toLocaleLowerCase().includes(needle));
  };
}

/** Top-level shapes from the anchor row to the target row, in list order, for Shift+click. */
export function outlineRangeIds(rows: readonly OutlineRow[], anchorId: string | null, targetId: string): string[] {
  const order = rows.filter((row) => row.level === 1).map((row) => row.id);
  const from = anchorId === null ? -1 : order.indexOf(anchorId);
  const to = order.indexOf(targetId);
  if (from === -1 || to === -1) return [targetId];
  return from <= to ? order.slice(from, to + 1) : order.slice(to, from + 1).reverse();
}

/** The shapes with `id` (at any depth) renamed, or null if no shape has that id or the name is unchanged. */
export function renameShapeInTree(shapes: readonly WorkplaneShape[], id: string, name: string): WorkplaneShape[] | null {
  let changed = false;
  const rename = (list: readonly WorkplaneShape[]): WorkplaneShape[] => list.map((shape) => {
    if (shape.id === id) {
      if (shape.name === name) return shape;
      changed = true;
      return { ...shape, name };
    }
    if (!shape.groupedShapes?.length) return shape;
    const children = rename(shape.groupedShapes);
    return children.every((child, index) => child === shape.groupedShapes![index]) ? shape : { ...shape, groupedShapes: children };
  });
  const next = rename(shapes);
  return changed ? next : null;
}

export const OUTLINE_NAME_MAX_LENGTH = 120;

/**
 * The name to store after the user edits `displayed` into `typed`: null when nothing should change,
 * so leaving a translated default name untouched keeps the English name that is saved in the project.
 */
export function outlineRenameValue(typed: string, displayed: string): string | null {
  const name = typed.trim().slice(0, OUTLINE_NAME_MAX_LENGTH);
  return name && name !== displayed ? name : null;
}
