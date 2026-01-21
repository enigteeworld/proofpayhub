// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ProofAnchor {
    event Anchored(bytes32 indexed proofHash, address indexed sender, uint256 timestamp);

    // optional: prevent duplicates
    mapping(bytes32 => bool) public anchored;

    function anchor(bytes32 proofHash) external {
        require(proofHash != bytes32(0), "bad hash");
        require(!anchored[proofHash], "already anchored");

        anchored[proofHash] = true;
        emit Anchored(proofHash, msg.sender, block.timestamp);
    }
}

