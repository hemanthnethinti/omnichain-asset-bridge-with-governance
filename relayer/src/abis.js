const bridgeLockAbi = [
  "event Locked(address indexed user, uint256 amount, uint256 nonce)",
  "function unlock(address user, uint256 amount, uint256 nonce) external",
  "function paused() external view returns (bool)"
];

const bridgeMintAbi = [
  "event Burned(address indexed user, uint256 amount, uint256 nonce)",
  "function mintWrapped(address user, uint256 amount, uint256 nonce) external"
];

const governanceVotingAbi = ["event ProposalPassed(uint256 proposalId, bytes data)"];

const governanceEmergencyAbi = ["function pauseBridge() external"];

module.exports = {
  bridgeLockAbi,
  bridgeMintAbi,
  governanceVotingAbi,
  governanceEmergencyAbi
};
