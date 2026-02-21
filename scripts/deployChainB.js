const path = require("path");
const hre = require("hardhat");
const { writeJSON } = require("./utils");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const relayerAddress = process.env.RELAYER_ADDRESS || deployer.address;
  const quorum = process.env.GOVERNANCE_QUORUM || hre.ethers.parseEther("1");

  const WrappedVaultToken = await hre.ethers.getContractFactory("WrappedVaultToken");
  const wrappedVaultToken = await WrappedVaultToken.deploy(deployer.address);
  await wrappedVaultToken.waitForDeployment();

  const BridgeMint = await hre.ethers.getContractFactory("BridgeMint");
  const bridgeMint = await BridgeMint.deploy(await wrappedVaultToken.getAddress(), deployer.address);
  await bridgeMint.waitForDeployment();

  const GovernanceVoting = await hre.ethers.getContractFactory("GovernanceVoting");
  const governanceVoting = await GovernanceVoting.deploy(await wrappedVaultToken.getAddress(), quorum);
  await governanceVoting.waitForDeployment();

  const minterRole = await wrappedVaultToken.MINTER_ROLE();
  const burnerRole = await wrappedVaultToken.BURNER_ROLE();
  const relayerRole = await bridgeMint.RELAYER_ROLE();

  await (await wrappedVaultToken.grantRole(minterRole, await bridgeMint.getAddress())).wait();
  await (await wrappedVaultToken.grantRole(burnerRole, await bridgeMint.getAddress())).wait();
  await (await bridgeMint.grantRole(relayerRole, relayerAddress)).wait();

  const deployment = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    relayer: relayerAddress,
    contracts: {
      WrappedVaultToken: await wrappedVaultToken.getAddress(),
      BridgeMint: await bridgeMint.getAddress(),
      GovernanceVoting: await governanceVoting.getAddress()
    }
  };

  writeJSON(path.join(process.cwd(), "deployments", "chain-b.json"), deployment);
  console.log("Chain B deployed:", deployment);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
