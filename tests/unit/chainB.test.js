const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Chain B Contracts", function () {
  async function deployFixture() {
    const [admin, relayer, user] = await ethers.getSigners();

    const WrappedVaultToken = await ethers.getContractFactory("WrappedVaultToken");
    const wrapped = await WrappedVaultToken.deploy(admin.address);

    const BridgeMint = await ethers.getContractFactory("BridgeMint");
    const bridgeMint = await BridgeMint.deploy(await wrapped.getAddress(), admin.address);

    const GovernanceVoting = await ethers.getContractFactory("GovernanceVoting");
    const governanceVoting = await GovernanceVoting.deploy(await wrapped.getAddress(), ethers.parseEther("1"));

    const relayerRole = await bridgeMint.RELAYER_ROLE();
    const minterRole = await wrapped.MINTER_ROLE();
    const burnerRole = await wrapped.BURNER_ROLE();

    await bridgeMint.grantRole(relayerRole, relayer.address);
    await wrapped.grantRole(minterRole, await bridgeMint.getAddress());
    await wrapped.grantRole(burnerRole, await bridgeMint.getAddress());

    return { admin, relayer, user, wrapped, bridgeMint, governanceVoting };
  }

  it("mints wrapped token via relayer and prevents replay", async function () {
    const { relayer, user, wrapped, bridgeMint } = await deployFixture();
    const amount = ethers.parseEther("50");

    await bridgeMint.connect(relayer).mintWrapped(user.address, amount, 9);
    expect(await wrapped.balanceOf(user.address)).to.equal(amount);

    await expect(bridgeMint.connect(relayer).mintWrapped(user.address, amount, 9)).to.be.reverted;
  });

  it("burn emits Burned and reduces balance", async function () {
    const { relayer, user, wrapped, bridgeMint } = await deployFixture();
    const amount = ethers.parseEther("10");

    await bridgeMint.connect(relayer).mintWrapped(user.address, amount, 11);

    await expect(bridgeMint.connect(user).burn(amount))
      .to.emit(bridgeMint, "Burned")
      .withArgs(user.address, amount, 0n);

    expect(await wrapped.balanceOf(user.address)).to.equal(0);
  });

  it("governance proposal passes and emits ProposalPassed", async function () {
    const { relayer, user, bridgeMint, governanceVoting } = await deployFixture();
    const votingPower = ethers.parseEther("2");

    await bridgeMint.connect(relayer).mintWrapped(user.address, votingPower, 1234);

    const tx = await governanceVoting.connect(user).createProposal("0x01", 1);
    const receipt = await tx.wait();
    const proposalId = receipt.logs.find((l) => l.fragment?.name === "ProposalCreated").args.proposalId;

    await governanceVoting.connect(user).vote(proposalId);
    await ethers.provider.send("evm_mine", []);
    await ethers.provider.send("evm_mine", []);

    await expect(governanceVoting.finalize(proposalId))
      .to.emit(governanceVoting, "ProposalPassed")
      .withArgs(proposalId, "0x01");
  });
});
