#![no_std]
//! Employer Registry — the searchable index for Lehitimo's DTICERT credential.
//!
//! The registry is the *index*; the classic DTICERT trustline is the *truth*.
//! Only the admin (the DTI issuer account) can write. Entries are kept on
//! revocation (status flips to `Revoked`) so the directory can warn applicants
//! instead of forgetting a scammer.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

const TTL_THRESHOLD: u32 = 1000;
const TTL_EXTEND: u32 = 5000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Status {
    Verified,
    Revoked,
}

/// One verified (or since-revoked) business, returned to the frontend.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Entry {
    pub employer: Address,
    pub name: String,
    pub cert_no: String,
    pub status: Status,
}

/// Storage layout: admin + address index in instance storage, one persistent
/// entry per employer address.
#[contracttype]
pub enum DataKey {
    Admin,
    Index,
    Entry(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotFound = 3,
}

#[contract]
pub struct EmployerRegistryContract;

#[contractimpl]
impl EmployerRegistryContract {
    /// Set the admin (the DTI issuer account). Can only be called once.
    ///
    /// Deliberately unauthenticated: the deploy script invokes it in the same
    /// breath as a fresh deploy and aborts loudly if it fails (a fresh contract
    /// can never be legitimately `AlreadyInitialized`). Accepted testnet risk.
    pub fn init(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Index, &Vec::<Address>::new(&env));
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        Ok(())
    }

    /// Read one business by employer address.
    pub fn get(env: Env, employer: Address) -> Option<Entry> {
        env.storage().persistent().get(&DataKey::Entry(employer))
    }
}

mod test;
