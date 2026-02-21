const path = require("path");
const hre = require("hardhat");
const { writeJSON } = require("./utils");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const relayerAddress = process.env.RELAYER_ADDRESS || deployer.address;

  const VaultToken = await hre.ethers.getContractFactory("VaultToken");
  const vaultToken = await VaultToken.deploy();
  await vaultToken.waitForDeployment();

  const BridgeLock = await hre.ethers.getContractFactory("BridgeLock");
  const bridgeLock = await BridgeLock.deploy(await vaultToken.getAddress(), deployer.address);
  await bridgeLock.waitForDeployment();

  const GovernanceEmergency = await hre.ethers.getContractFactory("GovernanceEmergency");
  const governanceEmergency = await GovernanceEmergency.deploy(await bridgeLock.getAddress(), deployer.address);
  await governanceEmergency.waitForDeployment();

  const pauserRole = await bridgeLock.PAUSER_ROLE();
  const relayerRole = await bridgeLock.RELAYER_ROLE();
  const govRelayerRole = await governanceEmergency.RELAYER_ROLE();

  await (await bridgeLock.grantRole(pauserRole, await governanceEmergency.getAddress())).wait();
  await (await bridgeLock.grantRole(relayerRole, relayerAddress)).wait();
  await (await governanceEmergency.grantRole(govRelayerRole, relayerAddress)).wait();

  const deployment = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    relayer: relayerAddress,
    contracts: {
      VaultToken: await vaultToken.getAddress(),
      BridgeLock: await bridgeLock.getAddress(),
      GovernanceEmergency: await governanceEmergency.getAddress()
    }
  };

  writeJSON(path.join(process.cwd(), "deployments", "chain-a.json"), deployment);
  console.log("Chain A deployed:", deployment);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
