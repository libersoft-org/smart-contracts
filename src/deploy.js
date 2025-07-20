import { ethers } from 'ethers';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { ContractVerifier } from './ContractVerifier.js';

export class TokenDeployer {
	constructor() {
		this.deploymentFile = './config/deployment.json';
		this.verifier = new ContractVerifier();
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
			console.log('Explorer:', networkConfig.explorerURL + '/address/' + contractAddress);
			// Save deployment information
			const deploymentInfo = {
				contractAddress: contractAddress,
				deployer: walletInfo.address,
				networkChainId: networkConfig.chainId,
				token: tokenConfig,
				deploymentTransaction: contract.deploymentTransaction().hash,
				timestamp: new Date().toISOString(),
			};
			writeFileSync(this.deploymentFile, JSON.stringify(deploymentInfo, null, 2));
			console.log('✓ Deployment info saved to config/deployment.json');
			// Contract verification
			await this.attemptVerification(contractAddress, networkConfig.chainId, tokenConfig);
			return deploymentInfo;
		} catch (error) {
			console.error('Deployment failed:', error.message);
			throw error;
		}
	}

	async attemptVerification(contractAddress, chainId, tokenConfig) {
		console.log('\n--- Contract Verification ---');
		// Get API key from config
		const apiKey = this.getApiKeyForChain(chainId);
		if (!apiKey) {
			console.log('⚠️ No API key found for verification');
			console.log('Configure API keys in "Block Explorer API Keys" menu');
			return;
		}
		console.log('🔍 API key found, attempting verification...');
		try {
			const verified = await this.verifier.verifyContract(contractAddress, chainId, tokenConfig, apiKey);
			if (verified) {
				console.log('✅ Contract verification completed successfully!');
			} else {
				console.log('❌ Contract verification failed');
				console.log('You can verify manually on the block explorer');
			}
		} catch (error) {
			console.log('❌ Verification failed:', error.message);
			console.log('You can verify manually on the block explorer');
		}
		
		// Wait for user to read the results
		console.log('');
		process.stdout.write('Press Enter to continue...');
		await new Promise(resolve => {
			process.stdin.once('data', () => resolve());
		});
	}

	getApiKeyForChain(chainId) {
		try {
			const explorersFile = './config/explorers.json';
			if (!existsSync(explorersFile)) return null;
			const explorers = JSON.parse(readFileSync(explorersFile, 'utf8'));
			return explorers[chainId.toString()] || null;
		} catch (error) {
			return null;
		}
	}

	getDeploymentInfo() {
		if (!existsSync(this.deploymentFile)) return null;
		return JSON.parse(readFileSync(this.deploymentFile, 'utf8'));
	}
}
