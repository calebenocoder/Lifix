/** Small editor interaction transaction: previews can change often; commit/cancel happens once. */
export class InteractionTransaction<Preview> {
  #active = false;
  #preview?: Preview;
  constructor(private readonly handlers: { readonly begin: (preview: Preview) => void; readonly update: (preview: Preview) => void; readonly finish: () => void }) {}
  get active(): boolean { return this.#active; }
  get preview(): Preview | undefined { return this.#preview; }
  begin(preview: Preview): void { this.#active = true; this.#preview = preview; this.handlers.begin(preview); }
  update(preview: Preview): void { if (!this.#active) return; this.#preview = preview; this.handlers.update(preview); }
  commit(): boolean { return this.#finish(); }
  cancel(): boolean { return this.#finish(); }
  #finish(): boolean { if (!this.#active) return false; this.#active = false; this.#preview = undefined; this.handlers.finish(); return true; }
}
