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

    /// Create or overwrite a business entry with status `Verified`.
    /// Admin-only. Overwriting doubles as "update details" and "reinstate".
    pub fn register(
        env: Env,
        employer: Address,
        name: String,
        cert_no: String,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let key = DataKey::Entry(employer.clone());
        if !env.storage().persistent().has(&key) {
            let mut index: Vec<Address> = env
                .storage()
                .instance()
                .get(&DataKey::Index)
                .unwrap_or(Vec::new(&env));
            index.push_back(employer.clone());
            env.storage().instance().set(&DataKey::Index, &index);
        }
        let entry = Entry {
            employer: employer.clone(),
            name,
            cert_no,
            status: Status::Verified,
        };
        env.storage().persistent().set(&key, &entry);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        env.events()
            .publish((symbol_short!("register"), employer), ());
        Ok(())
    }

    /// Flip a business to `Revoked` (kept listed so the directory can warn).
    /// Admin-only.
    pub fn revoke(env: Env, employer: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let key = DataKey::Entry(employer.clone());
        let mut entry: Entry = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotFound)?;
        entry.status = Status::Revoked;
        env.storage().persistent().set(&key, &entry);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        env.events().publish((symbol_short!("revoke"), employer), ());
        Ok(())
    }

    /// Every business ever registered (Verified and Revoked alike).
    pub fn list(env: Env) -> Vec<Entry> {
        let index: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Index)
            .unwrap_or(Vec::new(&env));
        let mut out = Vec::new(&env);
        for addr in index.iter() {
            if let Some(entry) = env.storage().persistent().get(&DataKey::Entry(addr)) {
                out.push_back(entry);
            }
        }
        out
    }

    /// Read one business by employer address.
    pub fn get(env: Env, employer: Address) -> Option<Entry> {
        env.storage().persistent().get(&DataKey::Entry(employer))
    }
}

mod test;
