const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Chain A Contracts", function () {
  async function deployFixture() {
    const [admin, relayer, user] = await ethers.getSigners();

    const VaultToken = await ethers.getContractFactory("VaultToken");
    const vaultToken = await VaultToken.deploy();

    const BridgeLock = await ethers.getContractFactory("BridgeLock");
    const bridgeLock = await BridgeLock.deploy(await vaultToken.getAddress(), admin.address);

    const GovernanceEmergency = await ethers.getContractFactory("GovernanceEmergency");
    const governanceEmergency = await GovernanceEmergency.deploy(await bridgeLock.getAddress(), admin.address);

    const relayerRole = await bridgeLock.RELAYER_ROLE();
    const pauserRole = await bridgeLock.PAUSER_ROLE();
    const govRelayerRole = await governanceEmergency.RELAYER_ROLE();

    await bridgeLock.grantRole(relayerRole, relayer.address);
    await bridgeLock.grantRole(pauserRole, await governanceEmergency.getAddress());
    await governanceEmergency.grantRole(govRelayerRole, relayer.address);

    await vaultToken.transfer(user.address, ethers.parseEther("1000"));

    return { admin, relayer, user, vaultToken, bridgeLock, governanceEmergency };
  }

  it("locks tokens and emits Locked event", async function () {
    const { user, vaultToken, bridgeLock } = await deployFixture();
    const amount = ethers.parseEther("100");

    await vaultToken.connect(user).approve(await bridgeLock.getAddress(), amount);

    await expect(bridgeLock.connect(user).lock(amount))
      .to.emit(bridgeLock, "Locked")
      .withArgs(user.address, amount, 0n);

    expect(await vaultToken.balanceOf(await bridgeLock.getAddress())).to.equal(amount);
  });

  it("allows relayer to unlock once per nonce", async function () {
    const { relayer, user, vaultToken, bridgeLock } = await deployFixture();
    const amount = ethers.parseEther("10");

    await vaultToken.transfer(await bridgeLock.getAddress(), amount);
    await bridgeLock.connect(relayer).unlock(user.address, amount, 777);

    await expect(bridgeLock.connect(relayer).unlock(user.address, amount, 777)).to.be.reverted;
  });

  it("blocks unlock for non-relayer", async function () {
    const { user, bridgeLock } = await deployFixture();
    await expect(bridgeLock.connect(user).unlock(user.address, 1, 123)).to.be.reverted;
  });

  it("governance emergency can pause bridge and lock reverts", async function () {
    const { relayer, user, vaultToken, bridgeLock, governanceEmergency } = await deployFixture();

    await governanceEmergency.connect(relayer).pauseBridge();
    expect(await bridgeLock.paused()).to.equal(true);

    await vaultToken.connect(user).approve(await bridgeLock.getAddress(), 1);
    await expect(bridgeLock.connect(user).lock(1)).to.be.reverted;
  });
});
