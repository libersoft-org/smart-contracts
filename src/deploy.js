import { ethers } from 'ethers';
import { readFileSync, writeFileSync, existsSync } from 'fs';

export class TokenDeployer {
	constructor() {
		this.deploymentFile = './config/deployment.json';
	}

	async deploy(tokenConfig, networkConfig, walletInfo) {
		try {
			console.log('Starting token deployment...');
			console.log('Network:', networkConfig.name);
			console.log('Token:', tokenConfig.name + ' (' + tokenConfig.symbol + ')');
			// Load compiled contract
			if (!existsSync('./build/Token.json')) throw new Error('Contract not compiled. Please compile first.');
			const contractJson = JSON.parse(readFileSync('./build/Token.json', 'utf8'));
			const { abi, bytecode } = contractJson;
			// Connect to network
			let provider;
			if (networkConfig.rpcUrl.startsWith('wss://') || networkConfig.rpcUrl.startsWith('ws://')) provider = new ethers.WebSocketProvider(networkConfig.rpcUrl);
			else provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
			const wallet = new ethers.Wallet(walletInfo.privateKey, provider);
			console.log('Deploying from address:', walletInfo.address);
			// Check balance
			const balance = await provider.getBalance(walletInfo.address);
			console.log('Account balance:', ethers.formatEther(balance), networkConfig.nativeCurrency.symbol);
			// Create contract factory
			const factory = new ethers.ContractFactory(abi, bytecode, wallet);
			// Estimate gas
			const estimatedGas = (await factory.getDeployTransaction(tokenConfig.name, tokenConfig.symbol, tokenConfig.decimals, ethers.parseUnits(tokenConfig.totalSupply.toString(), tokenConfig.decimals)).estimateGas?.()) || 2000000n;
			console.log('Estimated gas:', estimatedGas.toString());
			// Deploy contract
			console.log('Deploying contract...');
			const contract = await factory.deploy(tokenConfig.name, tokenConfig.symbol, tokenConfig.decimals, ethers.parseUnits(tokenConfig.totalSupply.toString(), tokenConfig.decimals), {
				gasLimit: estimatedGas + estimatedGas / 10n, // Add 10% buffer
			});
			console.log('Deployment transaction hash:', contract.deploymentTransaction().hash);
			console.log('Waiting for confirmation...');
			await contract.waitForDeployment();
			const contractAddress = await contract.getAddress();
			console.log('✓ Token deployed successfully!');
			console.log('Contract address:', contractAddress);
			console.log('Explorer:', networkConfig.explorerUrl + '/address/' + contractAddress);
			// Save deployment information
			const deploymentInfo = {
				contractAddress: contractAddress,
				deployer: walletInfo.address,
				network: { chainId: networkConfig.chainId },
				token: tokenConfig,
				deploymentTransaction: contract.deploymentTransaction().hash,
				timestamp: new Date().toISOString(),
			};
			writeFileSync(this.deploymentFile, JSON.stringify(deploymentInfo, null, 2));
			console.log('✓ Deployment info saved to config/deployment.json');
			return deploymentInfo;
		} catch (error) {
			console.error('Deployment failed:', error.message);
			throw error;
		}
	}

	getDeploymentInfo() {
		if (!existsSync(this.deploymentFile)) return null;
		return JSON.parse(readFileSync(this.deploymentFile, 'utf8'));
	}
}
