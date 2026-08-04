//! Canonical UTC whole-second completion timestamps.

use std::fmt::{self, Display, Formatter};
use std::str::FromStr;

use time::{Date, Month, OffsetDateTime, PrimitiveDateTime, Time, UtcOffset};

/// Construction error for [`CompletedAt`].
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("completed_at must be exactly YYYY-MM-DDTHH:MM:SSZ (UTC, whole seconds, years 0001-9999)")]
pub struct CompletedAtError;

/// Relay-acceptance time in the exact canonical form `YYYY-MM-DDTHH:MM:SSZ`.
#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct CompletedAt {
    unix_seconds: i64,
}

impl CompletedAt {
    /// Construct from a Unix timestamp in whole UTC seconds.
    ///
    /// Rejects values outside calendar years 0001–9999 UTC.
    pub fn from_unix_seconds(seconds: i64) -> Result<Self, CompletedAtError> {
        let dt = OffsetDateTime::from_unix_timestamp(seconds).map_err(|_| CompletedAtError)?;
        if dt.offset() != UtcOffset::UTC {
            return Err(CompletedAtError);
        }
        let year = dt.year();
        if !(1..=9999).contains(&year) {
            return Err(CompletedAtError);
        }
        // Guard against any leap-second representation leaking from the clock source.
        if dt.second() > 59 {
            return Err(CompletedAtError);
        }
        Ok(Self {
            unix_seconds: seconds,
        })
    }

    /// Unix timestamp in whole UTC seconds.
    #[must_use]
    pub fn unix_seconds(&self) -> i64 {
        self.unix_seconds
    }

    fn datetime(&self) -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(self.unix_seconds)
            .expect("CompletedAt always stores a valid UTC unix second")
    }
}

impl Display for CompletedAt {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let dt = self.datetime();
        write!(
            f,
            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
            dt.year(),
            u8::from(dt.month()),
            dt.day(),
            dt.hour(),
            dt.minute(),
            dt.second(),
        )
    }
}

impl FromStr for CompletedAt {
    type Err = CompletedAtError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        parse_canonical(s)
    }
}

impl TryFrom<&str> for CompletedAt {
    type Error = CompletedAtError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        value.parse()
    }
}

fn parse_canonical(s: &str) -> Result<CompletedAt, CompletedAtError> {
    // Exact shape before calendar validation: 20 ASCII bytes, fixed separators.
    let bytes = s.as_bytes();
    if bytes.len() != 20 {
        return Err(CompletedAtError);
    }
    if bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'Z'
    {
        return Err(CompletedAtError);
    }
    for (i, b) in bytes.iter().copied().enumerate() {
        if matches!(i, 4 | 7 | 10 | 13 | 16 | 19) {
            continue;
        }
        if !b.is_ascii_digit() {
            return Err(CompletedAtError);
        }
    }

    let year = parse_u16(&bytes[0..4])?;
    let month = parse_u8(&bytes[5..7])?;
    let day = parse_u8(&bytes[8..10])?;
    let hour = parse_u8(&bytes[11..13])?;
    let minute = parse_u8(&bytes[14..16])?;
    let second = parse_u8(&bytes[17..19])?;

    if !(1..=9999).contains(&year) {
        return Err(CompletedAtError);
    }
    if second > 59 {
        return Err(CompletedAtError);
    }

    let month = Month::try_from(month).map_err(|_| CompletedAtError)?;
    let date =
        Date::from_calendar_date(i32::from(year), month, day).map_err(|_| CompletedAtError)?;
    let time = Time::from_hms(hour, minute, second).map_err(|_| CompletedAtError)?;
    let dt = PrimitiveDateTime::new(date, time).assume_utc();
    let unix_seconds = dt.unix_timestamp();

    // Round-trip through Display to reject any non-canonical rendering edge cases.
    let value = CompletedAt { unix_seconds };
    if value.to_string() != s {
        return Err(CompletedAtError);
    }
    Ok(value)
}

fn parse_u16(digits: &[u8]) -> Result<u16, CompletedAtError> {
    let mut n = 0u16;
    for b in digits {
        n = n
            .checked_mul(10)
            .and_then(|n| n.checked_add(u16::from(b - b'0')))
            .ok_or(CompletedAtError)?;
    }
    Ok(n)
}

fn parse_u8(digits: &[u8]) -> Result<u8, CompletedAtError> {
    let mut n = 0u8;
    for b in digits {
        n = n
            .checked_mul(10)
            .and_then(|n| n.checked_add(b - b'0'))
            .ok_or(CompletedAtError)?;
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_canonical_and_round_trips() {
        let ts: CompletedAt = "2026-10-12T08:15:30Z".parse().unwrap();
        assert_eq!(ts.to_string(), "2026-10-12T08:15:30Z");
        assert_eq!(
            CompletedAt::from_unix_seconds(ts.unix_seconds())
                .unwrap()
                .to_string(),
            "2026-10-12T08:15:30Z"
        );
    }

    #[test]
    fn rejects_non_canonical_forms() {
        for bad in [
            "2026-10-12T08:15:30.0Z",
            "2026-10-12T08:15:30+00:00",
            "2026-10-12t08:15:30z",
            "2026-10-12T08:15:60Z",
            "2026-02-30T00:00:00Z",
            "0000-01-01T00:00:00Z",
            "2026-10-12T8:15:30Z",
        ] {
            assert!(bad.parse::<CompletedAt>().is_err(), "{bad}");
        }
    }
}
