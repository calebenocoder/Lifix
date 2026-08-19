//! Native editor-core boundary.
//!
//! The TypeScript implementation in `src/core` is the sole authoritative
//! document engine during the web-first phase. This crate intentionally does
//! not mirror document, layer, command, or project-format logic: a partial
//! duplicate would drift from the running web core.
//!
//! When native execution becomes necessary, migrate the complete Core behind
//! stable DTO and command contracts in one change. Rust then becomes the sole
//! authoritative implementation and the TypeScript engine is removed rather
//! than maintained in parallel.

/// Records the ownership policy for native consumers without defining domain state.
pub const CORE_OWNERSHIP_POLICY: &str = "typescript-web-core-until-atomic-rust-migration";
