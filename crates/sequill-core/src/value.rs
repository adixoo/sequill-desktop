//! One SQLite value, and how it travels as JSON.
//!
//! JSON has no 64-bit integers, binary or infinities, so those are tagged objects:
//! integers outside JavaScript's safe range are `{"$bigint": "…"}`, blobs are
//! `{"$blob": "<base64>"}` and non-finite reals are `{"$real": "Infinity"}`.
//! Everything else is a plain JSON value. The web app's `cell-codec.ts` is the other end.

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use rusqlite::ToSql;
use rusqlite::types::{ToSqlOutput, Value, ValueRef};
use serde::de::{self, MapAccess, Visitor};
use serde::ser::SerializeMap;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;

/// Largest integer a JavaScript number holds exactly (`Number.MAX_SAFE_INTEGER`).
pub const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

const BIGINT_TAG: &str = "$bigint";
const BLOB_TAG: &str = "$blob";
const REAL_TAG: &str = "$real";

#[derive(Debug, Clone, PartialEq)]
pub enum CellValue {
    Null,
    Integer(i64),
    Real(f64),
    Text(String),
    Blob(Vec<u8>),
}

pub type Row = Vec<CellValue>;

impl From<ValueRef<'_>> for CellValue {
    fn from(value: ValueRef<'_>) -> Self {
        match value {
            ValueRef::Null => Self::Null,
            ValueRef::Integer(i) => Self::Integer(i),
            ValueRef::Real(f) => Self::Real(f),
            ValueRef::Text(t) => Self::Text(String::from_utf8_lossy(t).into_owned()),
            ValueRef::Blob(b) => Self::Blob(b.to_vec()),
        }
    }
}

impl ToSql for CellValue {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(match self {
            Self::Null => ToSqlOutput::Owned(Value::Null),
            Self::Integer(i) => ToSqlOutput::Owned(Value::Integer(*i)),
            Self::Real(f) => ToSqlOutput::Owned(Value::Real(*f)),
            Self::Text(t) => ToSqlOutput::Borrowed(ValueRef::Text(t.as_bytes())),
            Self::Blob(b) => ToSqlOutput::Borrowed(ValueRef::Blob(b)),
        })
    }
}

impl CellValue {
    /// The value as an SQL literal, for dumps (never for running people's input).
    pub fn sql_literal(&self) -> String {
        match self {
            Self::Null => "NULL".into(),
            Self::Integer(i) => i.to_string(),
            Self::Real(f) if f.is_nan() => "NULL".into(),
            Self::Real(f) if f.is_infinite() => if *f > 0.0 { "1e999" } else { "-1e999" }.into(),
            // Debug keeps a ".0" on whole numbers, so REAL stays REAL when the dump is replayed.
            Self::Real(f) => format!("{f:?}"),
            Self::Text(t) => format!("'{}'", t.replace('\'', "''")),
            Self::Blob(b) => {
                let hex: String = b.iter().map(|byte| format!("{byte:02x}")).collect();
                format!("X'{hex}'")
            }
        }
    }
}

impl Serialize for CellValue {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Null => serializer.serialize_unit(),
            Self::Integer(i) if (-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(i) => {
                serializer.serialize_i64(*i)
            }
            Self::Integer(i) => tagged(serializer, BIGINT_TAG, i.to_string()),
            Self::Real(f) if f.is_finite() => serializer.serialize_f64(*f),
            Self::Real(f) => tagged(serializer, REAL_TAG, non_finite_name(*f).into()),
            Self::Text(t) => serializer.serialize_str(t),
            Self::Blob(b) => tagged(serializer, BLOB_TAG, BASE64.encode(b)),
        }
    }
}

fn tagged<S: Serializer>(serializer: S, tag: &str, value: String) -> Result<S::Ok, S::Error> {
    let mut map = serializer.serialize_map(Some(1))?;
    map.serialize_entry(tag, &value)?;
    map.end()
}

fn non_finite_name(f: f64) -> &'static str {
    if f.is_nan() {
        "NaN"
    } else if f > 0.0 {
        "Infinity"
    } else {
        "-Infinity"
    }
}

impl<'de> Deserialize<'de> for CellValue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(CellVisitor)
    }
}

struct CellVisitor;

impl<'de> Visitor<'de> for CellVisitor {
    type Value = CellValue;

    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("null, a number, a string, or a tagged $bigint/$blob/$real object")
    }

    fn visit_unit<E>(self) -> Result<CellValue, E> {
        Ok(CellValue::Null)
    }
    fn visit_none<E>(self) -> Result<CellValue, E> {
        Ok(CellValue::Null)
    }
    fn visit_bool<E>(self, v: bool) -> Result<CellValue, E> {
        Ok(CellValue::Integer(i64::from(v)))
    }
    fn visit_i64<E>(self, v: i64) -> Result<CellValue, E> {
        Ok(CellValue::Integer(v))
    }
    fn visit_u64<E: de::Error>(self, v: u64) -> Result<CellValue, E> {
        i64::try_from(v)
            .map(CellValue::Integer)
            .map_err(|_| E::custom("integer is larger than SQLite can store"))
    }
    fn visit_f64<E>(self, v: f64) -> Result<CellValue, E> {
        Ok(CellValue::Real(v))
    }
    fn visit_str<E>(self, v: &str) -> Result<CellValue, E> {
        Ok(CellValue::Text(v.to_owned()))
    }
    fn visit_string<E>(self, v: String) -> Result<CellValue, E> {
        Ok(CellValue::Text(v))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<CellValue, A::Error> {
        let Some((tag, value)) = map.next_entry::<String, String>()? else {
            return Err(de::Error::custom("empty object is not a value"));
        };
        if map.next_key::<String>()?.is_some() {
            return Err(de::Error::custom("a tagged value has exactly one key"));
        }
        match tag.as_str() {
            BIGINT_TAG => value
                .parse()
                .map(CellValue::Integer)
                .map_err(|_| de::Error::custom(format!("{value} is not a 64-bit integer"))),
            BLOB_TAG => BASE64
                .decode(value)
                .map(CellValue::Blob)
                .map_err(|e| de::Error::custom(format!("invalid base64 blob: {e}"))),
            REAL_TAG => match value.as_str() {
                "Infinity" => Ok(CellValue::Real(f64::INFINITY)),
                "-Infinity" => Ok(CellValue::Real(f64::NEG_INFINITY)),
                "NaN" => Ok(CellValue::Real(f64::NAN)),
                other => Err(de::Error::custom(format!("{other} is not a special real"))),
            },
            other => Err(de::Error::custom(format!("unknown value tag {other}"))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn round_trip(value: CellValue) -> CellValue {
        serde_json::from_value(serde_json::to_value(&value).unwrap()).unwrap()
    }

    #[test]
    fn plain_values_stay_plain_json() {
        assert_eq!(serde_json::to_value(CellValue::Null).unwrap(), json!(null));
        assert_eq!(
            serde_json::to_value(CellValue::Integer(42)).unwrap(),
            json!(42)
        );
        assert_eq!(
            serde_json::to_value(CellValue::Real(1.5)).unwrap(),
            json!(1.5)
        );
        assert_eq!(
            serde_json::to_value(CellValue::Text("hi".into())).unwrap(),
            json!("hi")
        );
        assert_eq!(
            serde_json::to_value(CellValue::Integer(MAX_SAFE_INTEGER)).unwrap(),
            json!(MAX_SAFE_INTEGER)
        );
    }

    #[test]
    fn values_json_cannot_hold_are_tagged() {
        assert_eq!(
            serde_json::to_value(CellValue::Integer(i64::MAX)).unwrap(),
            json!({ "$bigint": "9223372036854775807" })
        );
        assert_eq!(
            serde_json::to_value(CellValue::Blob(vec![0xca, 0xfe])).unwrap(),
            json!({ "$blob": "yv4=" })
        );
        assert_eq!(
            serde_json::to_value(CellValue::Real(f64::NEG_INFINITY)).unwrap(),
            json!({ "$real": "-Infinity" })
        );
    }

    #[test]
    fn every_kind_round_trips() {
        for value in [
            CellValue::Null,
            CellValue::Integer(-7),
            CellValue::Integer(i64::MIN),
            CellValue::Real(0.1),
            CellValue::Real(f64::INFINITY),
            CellValue::Text("it's".into()),
            CellValue::Blob(vec![]),
            CellValue::Blob(vec![0, 255, 1]),
        ] {
            assert_eq!(round_trip(value.clone()), value);
        }
    }

    #[test]
    fn rejects_unknown_tags_and_bad_payloads() {
        assert!(serde_json::from_value::<CellValue>(json!({ "$date": "x" })).is_err());
        assert!(serde_json::from_value::<CellValue>(json!({ "$bigint": "1.5" })).is_err());
        assert!(serde_json::from_value::<CellValue>(json!({ "$blob": "!!" })).is_err());
        assert!(serde_json::from_value::<CellValue>(json!([1])).is_err());
    }

    #[test]
    fn literals_replay_as_the_same_value() {
        assert_eq!(CellValue::Real(1.0).sql_literal(), "1.0");
        assert_eq!(CellValue::Real(9.99).sql_literal(), "9.99");
        assert_eq!(CellValue::Real(f64::INFINITY).sql_literal(), "1e999");
        assert_eq!(CellValue::Text("it's".into()).sql_literal(), "'it''s'");
        assert_eq!(CellValue::Blob(vec![0xca, 0xfe]).sql_literal(), "X'cafe'");
    }
}
