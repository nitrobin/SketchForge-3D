import { describe, expect, it } from "vitest";
import { createTranslator } from "@/i18n/translator";
import { CAMERA_FOCUS_MARGIN, easeInOutCubic, orthographicFocusZoom, perspectiveFocusDistance } from "@/lib/cameraFocus";
import {
  OUTLINE_NAME_MAX_LENGTH,
  buildOutlineRows,
  outlineItemType,
  outlineItemTypeLabel,
  outlineRangeIds,
  outlineRenameValue,
  outlineSearchMatcher,
  renameShapeInTree,
} from "@/lib/sceneOutline";
import type { WorkplaneShape } from "@/types/sketchforge";

const en = createTranslator("en");
const ru = createTranslator("ru");

function shape(id: string, patch: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return { id, name: "Box", kind: "box", color: "#d41721", x: 0, z: 0, size: 20, width: 20, depth: 20, height: 20, rotation: 0, ...patch };
}

const mesh = (sourceFormat: "stl" | "json") => ({ positions: [], baseWidth: 1, baseDepth: 1, baseHeight: 1, triangleCount: 0, sourceFormat });

// Box, a group (cylinder + inner group (sphere + hole cone)), text.
const design = (): WorkplaneShape[] => [
  shape("box"),
  shape("group", {
    name: "Group",
    kind: "mesh",
    groupOperation: "group",
    groupedShapes: [
      shape("cyl", { name: "Cylinder", kind: "cylinder" }),
      shape("inner", {
        name: "Group",
        kind: "mesh",
        groupOperation: "group",
        groupedShapes: [shape("ball", { name: "Ball", kind: "sphere" }), shape("cut", { name: "Cone", kind: "cone", hole: true })],
      }),
    ],
  }),
  shape("label", { name: "Text", kind: "text", hidden: true, locked: true }),
];

const summary = (rows: ReturnType<typeof buildOutlineRows>) => rows.map((row) => `${"  ".repeat(row.level - 1)}${row.id}`);

describe("Objects panel rows", () => {
  it("lists top-level shapes and keeps groups closed until opened", () => {
    const rows = buildOutlineRows(design(), new Set());
    expect(summary(rows)).toEqual(["box", "group", "label"]);
    expect(rows.map((row) => [row.posInSet, row.setSize, row.childCount, row.expanded])).toEqual([[1, 3, 0, false], [2, 3, 2, false], [3, 3, 0, false]]);
  });

  it("shows the parts of an opened group, with the group's shape as the one to select", () => {
    const rows = buildOutlineRows(design(), new Set(["group", "group/inner"]));
    expect(summary(rows)).toEqual(["box", "group", "  cyl", "  inner", "    ball", "    cut", "label"]);
    const ball = rows.find((row) => row.id === "ball")!;
    expect(ball).toMatchObject({ key: "group/inner/ball", parentKey: "group/inner", topLevelId: "group", level: 3, posInSet: 1, setSize: 2 });
  });

  it("opens a group whose part matches the search and leaves out the rest", () => {
    const rows = buildOutlineRows(design(), new Set(), outlineSearchMatcher(en, "ball"));
    expect(summary(rows)).toEqual(["group", "  inner", "    ball"]);
    expect(rows.map((row) => row.setSize)).toEqual([1, 1, 1]);
  });

  it("lists everything inside a shape that matches by itself, as usual", () => {
    const matches = outlineSearchMatcher(en, "group");
    expect(summary(buildOutlineRows(design(), new Set(), matches))).toEqual(["group"]);
    expect(summary(buildOutlineRows(design(), new Set(["group"]), matches))).toEqual(["group", "  cyl", "  inner"]);
  });

  it("lists nothing when nothing matches", () => {
    expect(buildOutlineRows(design(), new Set(["group"]), outlineSearchMatcher(en, "zzz"))).toEqual([]);
  });
});

describe("Objects panel search", () => {
  it("is off for an empty query", () => {
    expect(outlineSearchMatcher(en, "   ")).toBeUndefined();
  });

  it("finds default names as shown in the current language and as stored", () => {
    const box = shape("box");
    expect(outlineSearchMatcher(ru, "параллел")?.(box)).toBe(true);
    expect(outlineSearchMatcher(ru, "BOX")?.(box)).toBe(true);
    expect(outlineSearchMatcher(ru, "цилиндр")?.(box)).toBe(false);
  });

  it("finds a renamed shape by its type, and shapes by their state", () => {
    const leg = shape("leg", { name: "Ножка", kind: "cylinder" });
    expect(outlineSearchMatcher(ru, "цилинд")?.(leg)).toBe(true);
    expect(outlineSearchMatcher(ru, "отверстие")?.(shape("cut", { hole: true }))).toBe(true);
    expect(outlineSearchMatcher(ru, "отверстие")?.(leg)).toBe(false);
    expect(outlineSearchMatcher(en, "hidden")?.(design()[2])).toBe(true);
    expect(outlineSearchMatcher(en, "locked")?.(design()[2])).toBe(true);
  });
});

describe("Objects panel types", () => {
  it("names how a shape was made", () => {
    expect(outlineItemType(design()[1])).toBe("group");
    expect(outlineItemType(shape("i", { kind: "mesh", groupOperation: "intersection", groupedShapes: [shape("a")] }))).toBe("intersection");
    expect(outlineItemType(shape("s", { kind: "mesh", sketchOperation: "revolve", sketchProfile: { points: [], segments: [] } }))).toBe("sketchRevolve");
    expect(outlineItemType(shape("m", { kind: "mesh", importedMesh: mesh("stl") }))).toBe("imported");
    expect(outlineItemType(shape("b", { kind: "mesh", importedMesh: mesh("json") }))).toBe("mesh");
    expect(outlineItemType(shape("t", { kind: "torus" }))).toBe("torus");
  });

  it("labels every type in every language", () => {
    const shapes = [
      ...design(),
      shape("m", { kind: "mesh", importedMesh: mesh("stl") }),
      shape("g", { kind: "gear" }),
    ];
    for (const t of [en, ru]) {
      for (const entry of shapes) expect(outlineItemTypeLabel(t, entry)).not.toMatch(/^(common|panels)\./);
    }
    expect(outlineItemTypeLabel(en, shapes[3])).toBe("Imported STL model");
  });
});

describe("Objects panel selection range", () => {
  const rows = buildOutlineRows(design(), new Set(["group"]));

  it("takes the top-level shapes between the two rows, in list order", () => {
    expect(outlineRangeIds(rows, "box", "label")).toEqual(["box", "group", "label"]);
    expect(outlineRangeIds(rows, "label", "group")).toEqual(["label", "group"]);
  });

  it("selects only the clicked shape without a known start", () => {
    expect(outlineRangeIds(rows, null, "group")).toEqual(["group"]);
    expect(outlineRangeIds(rows, "deleted", "group")).toEqual(["group"]);
  });
});

describe("renaming from the Objects panel", () => {
  it("renames a top-level shape and keeps the other shapes as they are", () => {
    const shapes = design();
    const next = renameShapeInTree(shapes, "box", "Base")!;
    expect(next[0]).toEqual({ ...shapes[0], name: "Base" });
    expect(next[1]).toBe(shapes[1]);
    expect(next[2]).toBe(shapes[2]);
  });

  it("renames a part inside nested groups", () => {
    const shapes = design();
    const next = renameShapeInTree(shapes, "ball", "Eye")!;
    expect(next[1].groupedShapes![1].groupedShapes![0].name).toBe("Eye");
    expect(next[1].groupedShapes![0]).toBe(shapes[1].groupedShapes![0]);
    expect(shapes[1].groupedShapes![1].groupedShapes![0].name).toBe("Ball");
  });

  it("changes nothing for an unknown id or the same name", () => {
    expect(renameShapeInTree(design(), "nope", "X")).toBeNull();
    expect(renameShapeInTree(design(), "box", "Box")).toBeNull();
  });

  it("keeps the stored English default name when the shown translation is left as it is", () => {
    const shown = ru("common.shape.box");
    expect(outlineRenameValue(shown, shown)).toBeNull();
    expect(outlineRenameValue(`  ${shown}  `, shown)).toBeNull();
    expect(outlineRenameValue("   ", shown)).toBeNull();
    expect(outlineRenameValue(" Подставка ", shown)).toBe("Подставка");
    expect(outlineRenameValue("x".repeat(500), shown)).toHaveLength(OUTLINE_NAME_MAX_LENGTH);
  });
});

describe("zooming to shapes", () => {
  it("fits the bounding sphere in the narrower field of view, with a margin", () => {
    const fov = 38;
    const wide = perspectiveFocusDistance(10, fov, 2);
    expect((10 * CAMERA_FOCUS_MARGIN) / wide).toBeCloseTo(Math.sin((fov * Math.PI) / 360), 10);
    const narrow = perspectiveFocusDistance(10, fov, 0.5);
    expect(narrow).toBeGreaterThan(wide);
    expect(perspectiveFocusDistance(20, fov, 2)).toBeCloseTo(wide * 2, 10);
  });

  it("zooms an orthographic view so the sphere fits the smaller side", () => {
    expect(orthographicFocusZoom(10, 400, 200)).toBeCloseTo(200 / (20 * CAMERA_FOCUS_MARGIN), 10);
  });

  it("eases from start to end without overshooting", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(2)).toBe(1);
    const samples = Array.from({ length: 21 }, (_, index) => easeInOutCubic(index / 20));
    expect(samples.every((value, index) => index === 0 || value >= samples[index - 1])).toBe(true);
  });
});
