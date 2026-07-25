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
