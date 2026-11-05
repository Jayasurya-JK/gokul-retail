use crate::clock::Clock;
use crate::pin::{Argon2Hasher, PinHasher};
use crate::{AppContext, AppKind, Db, Result};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// Unique temp directory, removed on drop.
pub struct TempDir(PathBuf);

impl TempDir {
    pub fn new() -> TempDir {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir =
            std::env::temp_dir().join(format!("gokul-core-test-{}-{}", std::process::id(), n));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        TempDir(dir)
    }

    pub fn db_path(&self) -> PathBuf {
        self.0.join("data").join("gokul.db")
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Tiny deterministic generator so tests need no extra crate.
pub struct Lcg(pub u64);

impl Lcg {
    pub fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        self.0 >> 33
    }
}

/// A clock the test moves by hand.
pub struct FakeClock {
    unix: AtomicI64,
    mono_ms: AtomicU64,
}

impl FakeClock {
    pub fn new() -> Arc<FakeClock> {
        Arc::new(FakeClock {
            unix: AtomicI64::new(1_800_000_000),
            mono_ms: AtomicU64::new(1_000),
        })
    }

    /// Move both the wall clock and the monotonic clock forward.
    pub fn advance(&self, secs: i64) {
        self.unix.fetch_add(secs, Ordering::SeqCst);
        self.mono_ms
            .fetch_add(u64::try_from(secs).unwrap_or(0) * 1000, Ordering::SeqCst);
    }

    /// Change only the wall clock (someone altered the PC date). Monotonic time is unaffected.
    pub fn set_unix(&self, v: i64) {
        self.unix.store(v, Ordering::SeqCst);
    }

    pub fn unix(&self) -> i64 {
        self.unix.load(Ordering::SeqCst)
    }
}

impl Clock for FakeClock {
    fn unix_secs(&self) -> i64 {
        self.unix.load(Ordering::SeqCst)
    }

    fn mono_ms(&self) -> u64 {
        self.mono_ms.load(Ordering::SeqCst)
    }
}

/// Cheap Argon2 parameters that still count how often a PIN was really checked.
pub struct CountingHasher {
    inner: Argon2Hasher,
    pub verifies: AtomicUsize,
}

impl CountingHasher {
    pub fn cheap() -> Arc<CountingHasher> {
        Arc::new(CountingHasher {
            inner: Argon2Hasher::with_params(8, 1, 1),
            verifies: AtomicUsize::new(0),
        })
    }

    pub fn with_params(m: u32, t: u32) -> Arc<CountingHasher> {
        Arc::new(CountingHasher {
            inner: Argon2Hasher::with_params(m, t, 1),
            verifies: AtomicUsize::new(0),
        })
    }

    pub fn count(&self) -> usize {
        self.verifies.load(Ordering::SeqCst)
    }
}

impl PinHasher for CountingHasher {
    fn hash(&self, secret: &str) -> Result<String> {
        self.inner.hash(secret)
    }

    fn verify(&self, secret: &str, phc: &str) -> bool {
        self.verifies.fetch_add(1, Ordering::SeqCst);
        self.inner.verify(secret, phc)
    }

    fn needs_rehash(&self, phc: &str) -> bool {
        self.inner.needs_rehash(phc)
    }

    fn dummy_verify(&self, secret: &str) {
        self.verifies.fetch_add(1, Ordering::SeqCst);
        self.inner.dummy_verify(secret)
    }
}

/// An app context on the database file at `path`.
pub fn ctx_on(
    path: &Path,
    kind: AppKind,
    clock: &Arc<FakeClock>,
    hasher: Arc<dyn PinHasher>,
) -> AppContext {
    let db = Db::open(path).expect("open db");
    AppContext::new(
        kind,
        Some(path.to_path_buf()),
        Some(db),
        hasher,
        clock.clone(),
    )
}
