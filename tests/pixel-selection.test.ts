import { ClearPixelSelectionCommand, createDocument, createRectangularPixelSelection, deserializeProject, getPixelSelection, getPixelSelectionBounds, hasPixelSelection, serializeDocument, SetPixelSelectionCommand } from "../src/core";
import { createEditorSession } from "../src/ui/editor";
import { describe, expect, it } from "vitest";

describe("Core pixel selection", () => {
  it("starts empty and exposes detached Core query results", () => {
    const document = createDocument("doc", "Document", 100, 80);
    expect(hasPixelSelection(document)).toBe(false); expect(getPixelSelection(document)).toBeUndefined(); expect(getPixelSelectionBounds(document)).toBeUndefined();
    new SetPixelSelectionCommand(createRectangularPixelSelection({ x: 10.5, y: 20.25 }, { x: 40.75, y: 60.5 })).execute(document);
    const selection = getPixelSelection(document)!;
    (selection as { left: number }).left = 0;
    expect(getPixelSelection(document)).toEqual({ kind: "rectangle", left: 10.5, top: 20.25, right: 40.75, bottom: 60.5 });
  });

  it("normalizes, clips, replaces, clears, and reverses rectangular selection commands", () => {
    const document = createDocument("doc", "Document", 100, 80);
    const first = new SetPixelSelectionCommand(createRectangularPixelSelection({ x: 80, y: 70 }, { x: -20, y: 10 })); first.execute(document);
    expect(document.pixelSelection).toEqual({ kind: "rectangle", left: 0, top: 10, right: 80, bottom: 70 });
    const replacement = new SetPixelSelectionCommand(createRectangularPixelSelection({ x: 20, y: 20 }, { x: 30, y: 30 })); replacement.execute(document);
    expect(document.pixelSelection).toMatchObject({ left: 20, top: 20, right: 30, bottom: 30 }); replacement.undo(document);
    expect(document.pixelSelection).toMatchObject({ left: 0, top: 10, right: 80, bottom: 70 });
    const clear = new ClearPixelSelectionCommand(); clear.execute(document); expect(document.pixelSelection).toBeNull(); clear.undo(document); expect(document.pixelSelection).toMatchObject({ left: 0, top: 10, right: 80, bottom: 70 });
  });

  it("treats an empty document intersection as no selection and rejects malformed bounds", () => {
    const document = createDocument("doc", "Document", 100, 80);
    new SetPixelSelectionCommand(createRectangularPixelSelection({ x: 120, y: 100 }, { x: 160, y: 140 })).execute(document); expect(document.pixelSelection).toBeNull();
    expect(() => new SetPixelSelectionCommand({ kind: "rectangle", left: 4, top: 0, right: 3, bottom: 1 } as never).execute(document)).toThrow("normalized");
    expect(() => new SetPixelSelectionCommand({ kind: "rectangle", left: NaN, top: 0, right: 3, bottom: 1 } as never).execute(document)).toThrow("finite");
  });

  it("serializes committed selection while accepting v1 projects that omit it", () => {
    const document = createDocument("doc", "Document", 100, 80); new SetPixelSelectionCommand(createRectangularPixelSelection({ x: 1.5, y: 2.5 }, { x: 30.5, y: 40.5 })).execute(document);
    const project = serializeDocument(document); expect(project.document.pixelSelection).toMatchObject({ left: 1.5, top: 2.5, right: 30.5, bottom: 40.5 }); expect(deserializeProject(project).pixelSelection).toEqual(document.pixelSelection);
    const legacy = structuredClone(project) as { document: Record<string, unknown> }; delete legacy.document.pixelSelection; expect(deserializeProject(legacy).pixelSelection).toBeNull();
    const malformed = structuredClone(project) as { document: { pixelSelection: unknown } }; malformed.document.pixelSelection = { kind: "rectangle", left: 10, top: 5, right: 5, bottom: 20 }; expect(() => deserializeProject(malformed)).toThrow("positive normalized");
  });

  it("keeps Core pixel selection independent from session layer targeting and image rendering work", () => {
    const document = createDocument("doc", "Document", 100, 80); let imageNotifications = 0; let selectionNotifications = 0;
    const session = createEditorSession(document, (_document, change) => { if (change.affectsImageRendering) imageNotifications += 1; else selectionNotifications += 1; });
    session.executeDocumentCommand(new SetPixelSelectionCommand(createRectangularPixelSelection({ x: 1, y: 2 }, { x: 3, y: 4 })));
    expect(session.snapshot.pixelSelection).toMatchObject({ left: 1, top: 2, right: 3, bottom: 4 }); expect(session.snapshot.selectedLayerId).toBeNull(); expect(imageNotifications).toBe(0); expect(selectionNotifications).toBe(1);
  });
});
