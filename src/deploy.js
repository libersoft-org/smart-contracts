import { ethers } from 'ethers';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { ContractVerifier } from './ContractVerifier.js';
import { ContractCompiler } from './compile.js';

export class TokenDeployer {
	constructor() {
		this.deploymentFile = './config/deployment.json';
		this.verifier = new ContractVerifier();
		this.compiler = new ContractCompiler();
	}

	async deploy(tokenConfig, networkConfig, walletInfo, contractFile = null, contractName = null) {
		try {
			console.log('🚀 Starting universal contract deployment...');
			console.log('📡 Network:', networkConfig.name);
			
			// Minimal compilation - just get existing compiled contract
			const buildFile = './build/Token.json';
			if (!existsSync(buildFile)) {
				throw new Error('Contract not compiled. Please compile first.');
			}
			
			const contractJson = JSON.parse(readFileSync(buildFile, 'utf8'));
			const { abi, bytecode } = contractJson;
			
			console.log('� Contract: Token');

			// Connect to network
			let provider;
			if (networkConfig.rpcUrl.startsWith('wss://') || networkConfig.rpcUrl.startsWith('ws://')) {
				provider = new ethers.WebSocketProvider(networkConfig.rpcUrl);
			} else {
				provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
			}
			
			const wallet = new ethers.Wallet(walletInfo.privateKey, provider);
			console.log('💼 Deploying from address:', walletInfo.address);

			// Check balance
			const balance = await provider.getBalance(walletInfo.address);
			console.log('💰 Account balance:', ethers.formatEther(balance), networkConfig.nativeCurrency.symbol);

			// Create contract factory
			const factory = new ethers.ContractFactory(abi, bytecode, wallet);

			// Simple Token deployment
			const constructorArgs = [
				tokenConfig.name,
				tokenConfig.symbol, 
				tokenConfig.decimals,
				ethers.parseUnits(tokenConfig.totalSupply.toString(), tokenConfig.decimals)
			];

			console.log('⛽ Using default gas limit');

			// Deploy contract
			console.log('🚀 Deploying contract...');
			const contract = await factory.deploy(...constructorArgs, {
				gasLimit: 2500000n,
			});

			console.log('📝 Deployment transaction hash:', contract.deploymentTransaction().hash);
			console.log('⏳ Waiting for confirmation...');
			await contract.waitForDeployment();

			const contractAddress = await contract.getAddress();
			console.log('✅ Contract deployed successfully!');
			console.log('📍 Contract address:', contractAddress);
			console.log('🔍 Explorer:', networkConfig.explorerURL + '/address/' + contractAddress);

			// Save deployment information
			const deploymentInfo = {
				contractAddress: contractAddress,
				contractName: 'Token',
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
