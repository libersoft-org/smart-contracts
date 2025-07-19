<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Smart Contract Deployment Project

This is a Bun-based project for deploying smart contracts to the Polygon blockchain using ethers.js.

## Project Guidelines

- Use Bun runtime instead of Node.js
- Use ethers.js v6 for blockchain interactions
- Implement proper error handling and gas estimation
- Provide clear console output and progress indicators
- Use only English in all code comments and console messages\*\*

## Key Components

- `contracts/Token.sol` - Solidity smart contract example
- `compile.js` - Contract compilation script
- `deploy.js` - Main deployment script
- `index.js` - Configuration checker

## Best Practices

- Always validate environment configuration before deployment
- Use appropriate gas limits with safety buffers
- Provide clear user feedback during operations
- Save deployment information for future reference
- Include proper security warnings about private keys
- Write all code comments and user messages in English only
