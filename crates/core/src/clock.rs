//! Time source, injectable so lockout and idle rules can be tested without waiting.

use std::sync::OnceLock;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

pub trait Clock: Send + Sync {
    /// Wall-clock seconds since 1970 UTC. Can jump if someone changes the PC date.
    fn unix_secs(&self) -> i64;
    /// Monotonic milliseconds since some fixed point. Never goes back. Used for idle timers.
    fn mono_ms(&self) -> u64;
}

pub struct SystemClock;

static START: OnceLock<Instant> = OnceLock::new();

impl Clock for SystemClock {
    fn unix_secs(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
    }

    fn mono_ms(&self) -> u64 {
        START.get_or_init(Instant::now).elapsed().as_millis() as u64
    }
}
