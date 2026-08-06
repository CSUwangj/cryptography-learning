//! Injected backend clock for Completion receipt timestamps.

use std::time::{SystemTime, UNIX_EPOCH};

/// Whole-second Unix clock used when recording `received_at`.
pub trait Clock: Send + Sync {
    fn unix_seconds(&self) -> i64;
}

/// Wall clock in whole UTC seconds.
#[derive(Debug, Default, Clone, Copy)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn unix_seconds(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
    }
}

/// Deterministic clock for tests.
#[cfg(test)]
#[derive(Debug)]
pub struct FixedClock {
    seconds: std::sync::atomic::AtomicI64,
}

#[cfg(test)]
impl FixedClock {
    pub fn new(seconds: i64) -> Self {
        Self {
            seconds: std::sync::atomic::AtomicI64::new(seconds),
        }
    }

    pub fn set(&self, seconds: i64) {
        self.seconds
            .store(seconds, std::sync::atomic::Ordering::SeqCst);
    }
}

#[cfg(test)]
impl Clock for FixedClock {
    fn unix_seconds(&self) -> i64 {
        self.seconds.load(std::sync::atomic::Ordering::SeqCst)
    }
}
