import { describe, expect, it } from "vitest";
import { OffscreenSurfacePool } from "../src/renderer";

describe("offscreen surface lifecycle", () => {
  it("reuses stable bounds, replaces resized targets, prunes unused groups, and disposes", () => {
    let sequence = 0; const destroyed: number[] = []; const pool = new OffscreenSurfacePool(descriptor => ({ ...descriptor, sequence: ++sequence }), resource => destroyed.push(resource.sequence)); pool.beginUsage(); const first = pool.acquire({ key: "group", width: 10, height: 20 }); expect(pool.acquire({ key: "group", width: 10, height: 20 })).toBe(first); pool.endUsage(); pool.beginUsage(); const resized = pool.acquire({ key: "group", width: 11, height: 20 }); expect(resized).not.toBe(first); expect(destroyed).toEqual([1]); pool.endUsage(); pool.beginUsage(); pool.endUsage(); expect(pool.size).toBe(0); expect(destroyed).toEqual([1, 2]); pool.dispose();
  });
});
