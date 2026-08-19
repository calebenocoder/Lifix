export interface OffscreenSurfaceDescriptor { readonly key: string; readonly width: number; readonly height: number; }

/** Backend-neutral ownership/reuse policy. The resource itself remains private to its backend. */
export class OffscreenSurfacePool<Resource> {
  #entries = new Map<string, { descriptor: OffscreenSurfaceDescriptor; resource: Resource; usage: number }>(); #usage = 0;
  constructor(private readonly create: (descriptor: OffscreenSurfaceDescriptor) => Resource, private readonly destroy: (resource: Resource) => void = () => {}) {}
  beginUsage(): void { this.#usage += 1; }
  acquire(descriptor: OffscreenSurfaceDescriptor): Resource { const existing = this.#entries.get(descriptor.key); if (existing && existing.descriptor.width === descriptor.width && existing.descriptor.height === descriptor.height) { existing.usage = this.#usage; return existing.resource; } if (existing) this.destroy(existing.resource); const resource = this.create(descriptor); this.#entries.set(descriptor.key, { descriptor: { ...descriptor }, resource, usage: this.#usage }); return resource; }
  endUsage(): void { this.#entries.forEach((entry, key) => { if (entry.usage !== this.#usage) { this.destroy(entry.resource); this.#entries.delete(key); } }); }
  invalidate(key?: string): void { if (key !== undefined) { const entry = this.#entries.get(key); if (entry) this.destroy(entry.resource); this.#entries.delete(key); return; } this.#entries.forEach(entry => this.destroy(entry.resource)); this.#entries.clear(); }
  dispose(): void { this.invalidate(); }
  get size(): number { return this.#entries.size; }
}
