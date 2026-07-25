#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup(env: &Env) -> (EmployerRegistryContractClient<'_>, Address) {
    let contract_id = env.register(EmployerRegistryContract, ());
    let client = EmployerRegistryContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.init(&admin);
    (client, admin)
}

fn s(env: &Env, v: &str) -> String {
    String::from_str(env, v)
}

#[test]
fn init_once_then_double_init_fails() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let other = Address::generate(&env);
    assert_eq!(client.try_init(&other), Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn get_unknown_employer_is_none() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    assert_eq!(client.get(&Address::generate(&env)), None);
}

#[test]
fn register_before_init_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(EmployerRegistryContract, ());
    let client = EmployerRegistryContractClient::new(&env, &contract_id);
    let employer = Address::generate(&env);
    assert_eq!(
        client.try_register(&employer, &s(&env, "Acme"), &s(&env, "1234")),
        Err(Ok(Error::NotInitialized))
    );
}

#[test]
fn register_creates_verified_entry() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let employer = Address::generate(&env);

    client.register(&employer, &s(&env, "Acme Manpower"), &s(&env, "6171234"));

    let entry = client.get(&employer).unwrap();
    assert_eq!(entry.employer, employer);
    assert_eq!(entry.name, s(&env, "Acme Manpower"));
    assert_eq!(entry.cert_no, s(&env, "6171234"));
    assert_eq!(entry.status, Status::Verified);
    assert_eq!(client.list().len(), 1);
}

#[test]
fn revoke_marks_entry_and_keeps_it_listed() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let employer = Address::generate(&env);
    client.register(&employer, &s(&env, "Acme"), &s(&env, "1234"));

    client.revoke(&employer);

    assert_eq!(client.get(&employer).unwrap().status, Status::Revoked);
    assert_eq!(client.list().len(), 1);
}

#[test]
fn revoke_unknown_employer_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    assert_eq!(
        client.try_revoke(&Address::generate(&env)),
        Err(Ok(Error::NotFound))
    );
}

#[test]
fn re_register_updates_and_reinstates_without_duplicates() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let employer = Address::generate(&env);
    client.register(&employer, &s(&env, "Old Name"), &s(&env, "1111"));
    client.revoke(&employer);

    client.register(&employer, &s(&env, "New Name"), &s(&env, "2222"));

    let entry = client.get(&employer).unwrap();
    assert_eq!(entry.name, s(&env, "New Name"));
    assert_eq!(entry.cert_no, s(&env, "2222"));
    assert_eq!(entry.status, Status::Verified);
    assert_eq!(client.list().len(), 1);
}

#[test]
fn writes_require_auth() {
    let env = Env::default(); // NOTE: no mock_all_auths
    let (client, _admin) = setup(&env);
    let employer = Address::generate(&env);
    assert!(client
        .try_register(&employer, &s(&env, "Acme"), &s(&env, "1234"))
        .is_err());
    assert!(client.try_revoke(&employer).is_err());
}
