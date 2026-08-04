//! Validated identifier value types.

use std::fmt::{self, Display, Formatter};
use std::str::FromStr;

macro_rules! string_id {
    (
        $(#[$meta:meta])*
        $name:ident,
        $error:ident,
        $error_msg:expr,
        $validate:ident
        $(, $extra_impl:item)*
    ) => {
        $(#[$meta])*
        #[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
        pub struct $name(String);

        /// Construction error for [`$name`].
        #[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
        #[error($error_msg)]
        pub struct $error;

        impl $name {
            /// Borrow the canonical string value.
            #[must_use]
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl AsRef<str> for $name {
            fn as_ref(&self) -> &str {
                self.as_str()
            }
        }

        impl Display for $name {
            fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
                f.write_str(self.as_str())
            }
        }

        impl FromStr for $name {
            type Err = $error;

            fn from_str(s: &str) -> Result<Self, Self::Err> {
                if $validate(s) {
                    Ok(Self(s.to_owned()))
                } else {
                    Err($error)
                }
            }
        }

        impl TryFrom<&str> for $name {
            type Error = $error;

            fn try_from(value: &str) -> Result<Self, Self::Error> {
                value.parse()
            }
        }

        $($extra_impl)*
    };
}

fn is_student_id(s: &str) -> bool {
    let bytes = s.as_bytes();
    (1..=64).contains(&bytes.len())
        && bytes
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || *b == b'_' || *b == b'-')
}

fn is_slug_id(s: &str) -> bool {
    let bytes = s.as_bytes();
    if !(1..=64).contains(&bytes.len()) {
        return false;
    }
    let mut start = 0usize;
    for (i, b) in bytes.iter().copied().enumerate() {
        if b == b'-' {
            // Leading, trailing, or consecutive hyphens: a hyphen may only
            // separate two non-empty segments (`i == start` covers consecutive).
            if i == start || i + 1 == bytes.len() {
                return false;
            }
            start = i + 1;
            continue;
        }
        if !b.is_ascii_lowercase() && !b.is_ascii_digit() {
            return false;
        }
    }
    true
}

fn is_key_id(s: &str) -> bool {
    let bytes = s.as_bytes();
    (1..=128).contains(&bytes.len())
        && bytes
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || *b == b'.' || *b == b'_' || *b == b'-')
}

string_id!(
    /// Self-asserted student identifier carried in Completion Evidence.
    ///
    /// Canonical grammar: `^[A-Za-z0-9_-]{1,64}$`. Values are case-sensitive.
    StudentId,
    StudentIdError,
    "student ID must match ^[A-Za-z0-9_-]{{1,64}}$",
    is_student_id,
    impl StudentId {
        /// Trim surrounding ASCII whitespace, then validate the canonical form.
        pub fn from_user_input(input: &str) -> Result<Self, StudentIdError> {
            let trimmed = input.trim_matches(|c: char| c.is_ascii_whitespace());
            trimmed.parse()
        }
    }
);

string_id!(
    /// Global Lab identifier.
    ///
    /// Canonical grammar: `^[a-z0-9]+(?:-[a-z0-9]+)*$` with length 1–64.
    LabId,
    LabIdError,
    "lab ID must match ^[a-z0-9]+(?:-[a-z0-9]+)*$ with length 1-64 bytes",
    is_slug_id
);

string_id!(
    /// Course Run identifier.
    ///
    /// Canonical grammar: `^[a-z0-9]+(?:-[a-z0-9]+)*$` with length 1–64.
    CourseRunId,
    CourseRunIdError,
    "course run ID must match ^[a-z0-9]+(?:-[a-z0-9]+)*$ with length 1-64 bytes",
    is_slug_id
);

string_id!(
    /// Signing key identifier (`kid`). Establishes no trust by itself.
    ///
    /// Canonical grammar: `^[A-Za-z0-9._-]{1,128}$`.
    KeyId,
    KeyIdError,
    "key ID must match ^[A-Za-z0-9._-]{{1,128}}$",
    is_key_id
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn student_id_from_user_input_trims_ascii_whitespace() {
        let id = StudentId::from_user_input("  abc-123_X\t").unwrap();
        assert_eq!(id.as_str(), "abc-123_X");
    }

    #[test]
    fn student_id_from_str_does_not_trim() {
        assert!(" abc".parse::<StudentId>().is_err());
    }

    #[test]
    fn student_ids_are_case_sensitive() {
        let a: StudentId = "abc123".parse().unwrap();
        let b: StudentId = "ABC123".parse().unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn slug_rejects_uppercase_and_bad_hyphens() {
        assert!("Spn".parse::<LabId>().is_err());
        assert!("-spn".parse::<LabId>().is_err());
        assert!("spn-".parse::<LabId>().is_err());
        assert!("spn--basics".parse::<LabId>().is_err());
        assert!("spn_basics".parse::<LabId>().is_err());
        assert!("spn.basics".parse::<CourseRunId>().is_err());
    }

    #[test]
    fn slug_accepts_single_segment_and_hyphenated() {
        assert!("a".parse::<LabId>().is_ok());
        assert!("spn-basics".parse::<LabId>().is_ok());
        assert!("2026-autumn".parse::<CourseRunId>().is_ok());
    }
}
