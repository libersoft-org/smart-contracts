import { ethers } from 'ethers';
import { readFileSync, existsSync } from 'fs';
import { NetworkManager } from './NetworkManager.js';

export class TokenUtils {
	constructor() {
		this.deploymentFile = './config/deployment.json';
		this.configFile = './config/config.json';
		this.networkManager = new NetworkManager();
	}

	loadConfig() {
		if (!existsSync(this.configFile)) throw new Error('config.json not found');
		return JSON.parse(readFileSync(this.configFile, 'utf8'));
	}

	loadDeploymentInfo() {
		if (!existsSync(this.deploymentFile)) throw new Error('config/deployment.json not found. Deploy token first.');
		return JSON.parse(readFileSync(this.deploymentFile, 'utf8'));
	}

	async getTokenInfo() {
		try {
			const deploymentInfo = this.loadDeploymentInfo();
			const contractAddress = deploymentInfo.contractAddress;
			const chainId = deploymentInfo.network.chainId;
			const config = this.loadConfig();
			// Get network config by chainId
			const networkInfo = this.networkManager.getNetworkByChainId(chainId);
			if (!networkInfo) throw new Error(`Network with chainId ${chainId} not found`);
			const contractJson = JSON.parse(readFileSync('./build/Token.json', 'utf8'));
			const { abi } = contractJson;
			// Use active RPC URL from config instead of default from networks
			const provider = new ethers.JsonRpcProvider(config.activeRpcUrl);
			const contract = new ethers.Contract(contractAddress, abi, provider);
			const name = await contract.name();
			const symbol = await contract.symbol();
			const decimals = await contract.decimals();
			const totalSupply = await contract.totalSupply();
			return {
				address: contractAddress,
				name: name,
				symbol: symbol,
				decimals: Number(decimals),
				totalSupply: ethers.formatUnits(totalSupply, decimals),
				network: networkInfo,
				explorerUrl: networkInfo.explorerUrl + '/address/' + contractAddress,
			};
		} catch (error) {
			throw new Error('Failed to get token info: ' + error.message);
		}
	}

	async getBalance(walletAddress) {
		try {
			const deploymentInfo = this.loadDeploymentInfo();
			const contractAddress = deploymentInfo.contractAddress;
			const chainId = deploymentInfo.network.chainId;
			const config = this.loadConfig();
			// Get network config by chainId
			const networkInfo = this.networkManager.getNetworkByChainId(chainId);
			if (!networkInfo) throw new Error(`Network with chainId ${chainId} not found`);
			const contractJson = JSON.parse(readFileSync('./build/Token.json', 'utf8'));
			const { abi } = contractJson;
			const provider = new ethers.JsonRpcProvider(config.activeRpcUrl);
			const contract = new ethers.Contract(contractAddress, abi, provider);
			const balance = await contract.balanceOf(walletAddress);
			const decimals = await contract.decimals();
			return ethers.formatUnits(balance, decimals);
		} catch (error) {
			throw new Error('Failed to get balance: ' + error.message);
		}
	}

	async transfer(fromPrivateKey, toAddress, amount) {
		try {
			const deploymentInfo = this.loadDeploymentInfo();
			const contractAddress = deploymentInfo.contractAddress;
			const chainId = deploymentInfo.network.chainId;
			const config = this.loadConfig();
			// Get network config by chainId
			const networkInfo = this.networkManager.getNetworkByChainId(chainId);
			if (!networkInfo) throw new Error(`Network with chainId ${chainId} not found`);
			const contractJson = JSON.parse(readFileSync('./build/Token.json', 'utf8'));
			const { abi } = contractJson;
			const provider = new ethers.JsonRpcProvider(config.activeRpcUrl);
			const wallet = new ethers.Wallet(fromPrivateKey, provider);
			const contract = new ethers.Contract(contractAddress, abi, wallet);
			const decimals = await contract.decimals();
			const transferAmount = ethers.parseUnits(amount.toString(), decimals);
			console.log('Transferring ' + amount + ' tokens to ' + toAddress + '...');
			const tx = await contract.transfer(toAddress, transferAmount);
			console.log('Transaction hash:', tx.hash);
			await tx.wait();
			console.log('✓ Transfer successful!');
			console.log('Explorer:', networkInfo.explorerUrl + '/tx/' + tx.hash);
			return tx.hash;
		} catch (error) {
			throw new Error('Transfer failed: ' + error.message);
		}
	}
}
