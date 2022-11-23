use crate::{formatting::*, util::readline_masked};
use ad4m_client::agent;
use anyhow::{bail, Result};
use clap::Subcommand;

#[derive(Debug, Subcommand)]
pub enum AgentFunctions {
    /// Print the local agent's information (public perspective, direct message language, DID)
    Me,
    /// Show status of agent keys (locked/unlocked, etc.)
    Status,
    /// Lock the agent keys
    Lock,
    /// Unlock the agent keys
    Unlock {
        /// Agent passphrase
        #[arg(short, long)]
        passphrase: Option<String>,
    },
    /// Lookup agent by DID
    ByDID { did: String },
    /// Initialize a new agent
    Generate {
        /// Agent passphrase
        #[arg(short, long)]
        passphrase: Option<String>,
    },
}

pub async fn run(cap_token: String, command: AgentFunctions) -> Result<()> {
    match command {
        AgentFunctions::Me => {
            let agent = agent::me(cap_token).await?;
            print_agent(agent.into());
        }
        AgentFunctions::Status => {
            let status = agent::status(cap_token).await?;
            println!(
                "\x1b[36mDID: \x1b[97m{}",
                status.did.unwrap_or_else(|| "<undefined>".to_string())
            );
            println!("\x1b[36mis_initiliazed: \x1b[97m{}", status.is_initialized);
            println!("\x1b[36mis_unlocked: \x1b[97m{}", status.is_unlocked);
            println!(
                "\x1b[36mDID Document:\n\x1b[97m{}",
                status
                    .did_document
                    .unwrap_or_else(|| "<undefined>".to_string())
            );
        }
        AgentFunctions::Lock => {
            let result = agent::lock(cap_token, readline_masked("Passphrase: ")?).await?;
            if let Some(error) = result.error {
                bail!(error);
            } else {
                println!("Agent locked");
            }
        }
        AgentFunctions::Unlock { passphrase } => {
            let pp = if passphrase.is_some() {
                passphrase.unwrap()
            } else {
                readline_masked("Passphrase: ")?
            };
            
            let result = agent::unlock(cap_token, pp).await?;
            if let Some(error) = result.error {
                bail!(error);
            } else {
                println!("Agent unlocked");
            }
        }
        AgentFunctions::ByDID { did } => {
            if let Some(agent) = agent::by_did(cap_token, did).await? {
                print_agent(agent.into());
            } else {
                println!("Agent not found");
            }
        }
        AgentFunctions::Generate { passphrase } => {
            let pp = if passphrase.is_some() {
                passphrase.unwrap()
            } else {
                let passphrase1 = readline_masked("Passphrase: ")?;
                let passphrase2 = readline_masked("Repeat passphrase: ")?;
                if passphrase1 != passphrase2 {
                    bail!("Passphrases do not match");
                }
                passphrase1
            };
            
            let result = agent::generate(cap_token, pp).await?;
            if let Some(error) = result.error {
                bail!(error);
            } else {
                println!("Agent generated");
            }
        }
    };
    Ok(())
}
