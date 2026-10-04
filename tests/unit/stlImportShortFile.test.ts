import { describe, expect, it } from "vitest";
import { importedShapeFromStl } from "@/lib/stlImport";

function binaryStl(triangles: number[][][]) {
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);
  triangles.forEach((triangle, index) => {
    const offset = 84 + index * 50 + 12;
    triangle.flat().forEach((value, component) => view.setFloat32(offset + component * 4, value, true));
  });
  return buffer;
}

describe("STL import of short files", () => {
  it.each([
    ["an empty file", new ArrayBuffer(0)],
    ["a short ASCII stub", new TextEncoder().encode("solid stub\nendsolid stub\n").buffer],
    ["a truncated binary header", new ArrayBuffer(83)],
  ])("reports %s as empty geometry instead of a RangeError", (_label, buffer) => {
    expect(() => importedShapeFromStl("short.stl", buffer)).toThrow("STL geometry is empty");
  });

  it("still imports the smallest binary STL with one triangle", () => {
    const shape = importedShapeFromStl("triangle.stl", binaryStl([[[0, 0, 0], [10, 0, 0], [0, 10, 0]]]));
    expect(shape.importedMesh?.positions).toHaveLength(9);
    expect(shape.width).toBeCloseTo(10);
  });
});
