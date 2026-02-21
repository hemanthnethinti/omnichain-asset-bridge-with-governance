// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./WrappedVaultToken.sol";

contract GovernanceVoting {
    struct Proposal {
        bytes data;
        uint256 yesVotes;
        uint256 deadline;
        bool executed;
        mapping(address => bool) hasVoted;
    }

    WrappedVaultToken public immutable wrappedToken;
    uint256 public immutable quorum;
    uint256 public proposalCount;

    mapping(uint256 => Proposal) private proposals;

    event ProposalCreated(uint256 indexed proposalId, bytes data, uint256 deadline);
    event Voted(uint256 indexed proposalId, address indexed voter, uint256 weight);
    event ProposalPassed(uint256 proposalId, bytes data);

    constructor(address wrappedTokenAddress, uint256 quorumVotes) {
        require(wrappedTokenAddress != address(0), "invalid token");
        require(quorumVotes > 0, "invalid quorum");

        wrappedToken = WrappedVaultToken(wrappedTokenAddress);
        quorum = quorumVotes;
    }

    function createProposal(bytes calldata data, uint256 votingPeriodBlocks) external returns (uint256) {
        require(wrappedToken.balanceOf(msg.sender) > 0, "no voting power");
        require(votingPeriodBlocks > 0, "invalid period");

        uint256 proposalId = proposalCount;
        proposalCount += 1;

        Proposal storage proposal = proposals[proposalId];
        proposal.data = data;
        proposal.deadline = block.number + votingPeriodBlocks;

        emit ProposalCreated(proposalId, data, proposal.deadline);
        return proposalId;
    }

    function vote(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(block.number <= proposal.deadline, "voting ended");
        require(!proposal.hasVoted[msg.sender], "already voted");

        uint256 weight = wrappedToken.balanceOf(msg.sender);
        require(weight > 0, "no weight");

        proposal.hasVoted[msg.sender] = true;
        proposal.yesVotes += weight;

        emit Voted(proposalId, msg.sender, weight);
    }

    function finalize(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(block.number > proposal.deadline, "voting active");
        require(!proposal.executed, "already finalized");

        proposal.executed = true;
        if (proposal.yesVotes >= quorum) {
            emit ProposalPassed(proposalId, proposal.data);
        }
    }

    function getProposal(uint256 proposalId)
        external
        view
        returns (bytes memory data, uint256 yesVotes, uint256 deadline, bool executed)
    {
        Proposal storage proposal = proposals[proposalId];
        return (proposal.data, proposal.yesVotes, proposal.deadline, proposal.executed);
    }
}
