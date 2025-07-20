import prompts from 'prompts';
import { ethers } from 'ethers';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { WalletManager } from './WalletManager.js';
import { NetworkManager } from './NetworkManager.js';
import { ContractCompiler } from './compile.js';
import { TokenDeployer } from './deploy.js';
import { TokenUtils } from './utils.js';

class SmartContactsDeploymentTool {
	constructor() {
		this.walletManager = new WalletManager();
		this.networkManager = new NetworkManager();
		this.compiler = new ContractCompiler();
		this.deployer = new TokenDeployer();
		this.tokenUtils = new TokenUtils();
		this.activeWallet = null;
		this.activeAddress = null;
		this.activeAddressIndex = null;
		this.activeNetwork = null;
		this.activeRpcUrl = null;
		this.configFile = './config/config.json';
		// Load saved configuration
		this.loadConfiguration();
	}

	async showMainMenu() {
		console.clear();
		console.log('===============================');
		console.log('Smart Contracts Deployment Tool');
		console.log('===============================');
		console.log('');
		if (this.activeWallet && this.activeAddress) {
			console.log('Active wallet:', this.activeWallet);
			console.log('Active address:', this.activeAddress + ' (index ' + this.activeAddressIndex + ')');
		}
		if (this.activeNetwork) {
			console.log('Active network:', this.activeNetwork);
			if (this.activeRpcUrl) {
				const providerType = this.networkManager.getProviderType(this.activeRpcUrl);
				console.log('Active RPC:', this.activeRpcUrl + ' (' + providerType + ')');
			}
		}
		// Show native balance if wallet, network, and RPC are selected
		if (this.activeWallet && this.activeAddress && this.activeNetwork && this.activeRpcUrl) {
			const balanceInfo = await this.getNativeBalance();
			if (balanceInfo) {
				if (balanceInfo.error) {
					console.log('Balance:', balanceInfo.message + ' ❌');
				} else {
					console.log('Balance:', balanceInfo.balance + ' ' + balanceInfo.symbol);
				}
			}
		}
		console.log('');
		const response = await prompts({
			type: 'select',
			name: 'action',
			message: 'What would you like to do?',
			choices: [
				{ title: '1. Wallet Management', value: 'wallets' },
				{ title: '2. Select Active Wallet & Address', value: 'selectWallet' },
				{ title: '3. Select Network & RPC', value: 'selectNetwork' },
				{ title: '4. Deploy Token', value: 'deploy' },
				{ title: '5. Token Utilities', value: 'utils' },
				{ title: '6. Exit', value: 'exit' },
			],
		});

		switch (response.action) {
			case 'wallets':
				await this.walletManagement();
				break;
			case 'selectWallet':
				await this.selectActiveWallet();
				break;
			case 'selectNetwork':
				await this.selectActiveNetwork();
				break;
			case 'deploy':
				await this.deployToken();
				break;
			case 'utils':
				await this.tokenUtilities();
				break;
			case 'exit':
				console.log('Goodbye!');
				process.exit(0);
				break;
			default:
				await this.showMainMenu();
		}
	}

	async walletManagement() {
		console.clear();
		console.log('Wallet Management');
		console.log('=================');
		const walletNames = this.walletManager.getWalletNames();
		const choices = [{ title: 'Add new wallet', value: 'add' }, ...walletNames.map(name => ({ title: name, value: name })), { title: 'Back to main menu', value: 'back' }];
		const response = await prompts({
			type: 'select',
			name: 'action',
			message: 'Select wallet or action:',
			choices,
		});
		if (response.action === 'add') await this.addWallet();
		else if (response.action === 'back') await this.showMainMenu();
		else await this.manageWallet(response.action);
	}

	async addWallet() {
		const walletData = await prompts([
			{
				type: 'text',
				name: 'name',
				message: 'Enter wallet name:',
			},
			{
				type: 'text',
				name: 'seedPhrase',
				message: 'Enter seed phrase:',
			},
		]);

		try {
			this.walletManager.addWallet(walletData.name, walletData.seedPhrase);
			console.log('✓ Wallet added successfully!');
			await this.waitForEnter();
		} catch (error) {
			console.error('Error:', error.message);
			await this.waitForEnter();
		}
		await this.walletManagement();
	}

	async manageWallet(walletName) {
		console.clear();
		console.log('Manage Wallet:', walletName);
		console.log('==============');
		const addresses = this.walletManager.getAddresses(walletName);
		const choices = [
			{ title: 'Add new address', value: 'addAddress' },
			{ title: 'Remove wallet', value: 'removeWallet' },
			...addresses.map(addr => ({
				title: 'Address ' + addr.index + ': ' + addr.address,
				value: 'address_' + addr.index,
			})),
			{ title: 'Back', value: 'back' },
		];
		const response = await prompts({
			type: 'select',
			name: 'action',
			message: 'Select action:',
			choices,
		});
		if (!response.action) {
			await this.walletManagement();
			return;
		}
		if (response.action === 'addAddress') await this.addAddress(walletName);
		else if (response.action === 'removeWallet') await this.removeWallet(walletName);
		else if (response.action && response.action.startsWith('address_')) {
			const indexStr = response.action.split('_')[1];
			const index = indexStr === '-1' ? -1 : parseInt(indexStr);
			await this.manageAddress(walletName, index);
		} else await this.walletManagement();
	}
	async addAddress(walletName) {
		const response = await prompts({
			type: 'number',
			name: 'index',
			message: 'Enter address index (0, 1, 2...):',
		});
		if (response.index === undefined) {
			await this.manageWallet(walletName);
			return;
		}
		try {
			this.walletManager.addAddress(walletName, response.index);
			console.log('✓ Address added successfully!');
		} catch (error) {
			console.error('Error:', error.message);
		}
		await this.waitForEnter();
		await this.manageWallet(walletName);
	}
	async removeWallet(walletName) {
		const confirm = await prompts({
			type: 'confirm',
			name: 'confirmed',
			message: 'Are you sure you want to remove this wallet?',
		});
		if (confirm.confirmed) {
			try {
				this.walletManager.removeWallet(walletName);
				console.log('✓ Wallet removed successfully!');
			} catch (error) {
				console.error('Error:', error.message);
			}
		}
		await this.waitForEnter();
		await this.walletManagement();
	}

	async manageAddress(walletName, addressIndex) {
		console.clear();
		console.log('Address Information');
		console.log('===================');
		try {
			let addressInfo;
			if (this.activeNetwork && this.activeRpcUrl) {
				const provider = new ethers.JsonRpcProvider(this.activeRpcUrl);
				addressInfo = await this.walletManager.getAddressInfo(walletName, addressIndex, provider);
			} else {
				const addresses = this.walletManager.getAddresses(walletName);
				addressInfo = addresses.find(addr => addr.index === addressIndex);
				if (addressInfo) addressInfo.balance = 'Select network first';
			}
			if (!addressInfo) {
				console.log('Address not found');
				await this.waitForEnter();
				await this.manageWallet(walletName);
				return;
			}
			console.log('Index:', addressInfo.index);
			console.log('Address:', addressInfo.address);
			console.log('Balance:', addressInfo.balance);
			if (this.activeNetwork) console.log('Network:', this.activeNetwork);
			const choices = [
				{ title: 'Remove this address', value: 'remove' },
				{ title: 'Back', value: 'back' },
			];
			const response = await prompts({
				type: 'select',
				name: 'action',
				message: 'Select action:',
				choices,
			});
			if (response.action === 'remove') {
				const confirm = await prompts({
					type: 'confirm',
					name: 'confirmed',
					message: 'Remove this address?',
				});
				if (confirm.confirmed) {
					this.walletManager.removeAddress(walletName, addressIndex);
					console.log('✓ Address removed successfully!');
					await this.waitForEnter();
				}
			}
		} catch (error) {
			console.error('Error:', error.message);
			await this.waitForEnter();
		}
		await this.manageWallet(walletName);
	}
	async selectActiveWallet() {
		console.clear();
		console.log('Select Active Wallet');
		console.log('====================');
		const walletNames = this.walletManager.getWalletNames();
		if (walletNames.length === 0) {
			console.log('No wallets found. Please add a wallet first.');
			await this.waitForEnter();
			await this.showMainMenu();
			return;
		}
		const walletResponse = await prompts({
			type: 'select',
			name: 'wallet',
			message: 'Select wallet:',
			choices: [...walletNames.map(name => ({ title: name, value: name })), { title: 'Back', value: 'back' }],
		});
		if (walletResponse.wallet === 'back') {
			await this.showMainMenu();
			return;
		}
		const addresses = this.walletManager.getAddresses(walletResponse.wallet);
		if (addresses.length === 0) {
			console.log('No addresses in this wallet. Please add an address first.');
			await this.waitForEnter();
			await this.showMainMenu();
			return;
		}
		const addressResponse = await prompts({
			type: 'select',
			name: 'address',
			message: 'Select address:',
			choices: addresses.map(addr => ({
				title: 'Index ' + addr.index + ': ' + addr.address,
				value: addr.index,
			})),
		});
		if (addressResponse.address === undefined) {
			await this.showMainMenu();
			return;
		}
		this.activeWallet = walletResponse.wallet;
		const selectedAddress = addresses.find(addr => addr.index === addressResponse.address);
		this.activeAddress = selectedAddress.address;
		this.activeAddressIndex = selectedAddress.index;
		// Save configuration
		this.saveConfiguration();
		console.log('✓ Active wallet set:', this.activeWallet);
		console.log('✓ Active address set:', this.activeAddress);
		await this.waitForEnter();
		await this.showMainMenu();
	}

	async selectActiveNetwork() {
		console.clear();
		console.log('Select Network');
		console.log('==============');
		const networkNames = this.networkManager.getNetworkNames();
		const networkResponse = await prompts({
			type: 'select',
			name: 'network',
			message: 'Select network:',
			choices: [...networkNames.map(name => ({ title: name, value: name })), { title: 'Back', value: 'back' }],
		});
		if (networkResponse.network === 'back') {
			await this.showMainMenu();
			return;
		}
		console.log('Select RPC URL...');
		const allUrls = this.networkManager.getAllRpcUrls(networkResponse.network);
		const rpcChoices = allUrls.map(urlObj => ({
			title: `${urlObj.url} (${this.networkManager.getProviderType(urlObj.url)})`,
			value: urlObj.url,
		}));
		if (rpcChoices.length === 0) {
			console.log('No RPC URLs found for this network.');
			await this.waitForEnter();
			await this.selectActiveNetwork();
			return;
		}
		const rpcResponse = await prompts({
			type: 'select',
			name: 'rpcUrl',
			message: 'Select RPC URL:',
			choices: rpcChoices,
		});
		if (!rpcResponse.rpcUrl) {
			await this.showMainMenu();
			return;
		}
		this.activeNetwork = networkResponse.network;
		this.activeRpcUrl = rpcResponse.rpcUrl;
		// Save configuration
		this.saveConfiguration();
		console.log('✓ Active network set:', this.activeNetwork);
		console.log('✓ Active RPC URL set:', this.activeRpcUrl);
		await this.waitForEnter();
		await this.showMainMenu();
	}

	async deployToken() {
		if (!this.activeWallet || !this.activeAddress || !this.activeNetwork || !this.activeRpcUrl) {
			console.log('Please select wallet, address, and network first.');
			await this.waitForEnter();
			await this.showMainMenu();
			return;
		}
		console.clear();
		console.log('Deploy Token');
		console.log('============');
		const tokenConfig = await prompts([
			{
				type: 'text',
				name: 'name',
				message: 'Token name:',
				initial: 'MyToken',
			},
			{
				type: 'text',
				name: 'symbol',
				message: 'Token symbol:',
				initial: 'MYT',
			},
			{
				type: 'number',
				name: 'decimals',
				message: 'Decimals:',
				initial: 18,
			},
			{
				type: 'number',
				name: 'totalSupply',
				message: 'Total supply:',
				initial: 1000000000,
			},
		]);

		try {
			console.log('Compiling contract...');
			const compiled = await this.compiler.compile();
			if (!compiled) throw new Error('Contract compilation failed');
			const networkConfig = this.networkManager.getNetwork(this.activeNetwork);
			networkConfig.rpcUrl = this.activeRpcUrl;
			// Get complete wallet info including private key
			const walletInfo = this.walletManager.getWalletInfo(this.activeWallet, this.activeAddressIndex);
			if (!walletInfo) throw new Error('Failed to get wallet information');
			console.log('Deploying token...');
			await this.deployer.deploy(tokenConfig, networkConfig, walletInfo);
		} catch (error) {
			console.error('Deployment failed:', error.message);
		}
		await this.waitForEnter();
		await this.showMainMenu();
	}

	async tokenUtilities() {
		const deploymentInfo = this.deployer.getDeploymentInfo();
		if (!deploymentInfo) {
			console.log('No deployed token found. Please deploy a token first.');
			await this.waitForEnter();
			await this.showMainMenu();
			return;
		}
		console.clear();
		console.log('Token Utilities');
		console.log('===============');
		const response = await prompts({
			type: 'select',
			name: 'action',
			message: 'Select action:',
			choices: [
				{ title: 'Show token info', value: 'info' },
				{ title: 'Transfer tokens', value: 'transfer' },
				{ title: 'Check balance', value: 'balance' },
				{ title: 'Back', value: 'back' },
			],
		});

		switch (response.action) {
			case 'info':
				await this.showTokenInfo();
				break;
			case 'transfer':
				await this.transferTokens();
				break;
			case 'balance':
				await this.checkBalance();
				break;
			case 'back':
				await this.showMainMenu();
				break;
		}
	}

	async showTokenInfo() {
		try {
			const tokenInfo = await this.tokenUtils.getTokenInfo();
			console.log('');
			console.log('Token Information:');
			console.log('==================');
			console.log('Name:', tokenInfo.name);
			console.log('Symbol:', tokenInfo.symbol);
			console.log('Decimals:', tokenInfo.decimals);
			console.log('Total Supply:', tokenInfo.totalSupply);
			console.log('Address:', tokenInfo.address);
			console.log('Network:', tokenInfo.network.name);
			console.log('Explorer:', tokenInfo.explorerUrl);
		} catch (error) {
			console.error('Error:', error.message);
		}
		await this.waitForEnter();
		await this.tokenUtilities();
	}

	async transferTokens() {
		if (!this.activeAddress) {
			console.log('Please select an active wallet and address first.');
			await this.waitForEnter();
			await this.tokenUtilities();
			return;
		}
		const transferData = await prompts([
			{
				type: 'text',
				name: 'toAddress',
				message: 'Recipient address:',
			},
			{
				type: 'number',
				name: 'amount',
				message: 'Amount to transfer:',
			},
		]);
		try {
			await this.tokenUtils.transfer(this.activeAddress.privateKey, transferData.toAddress, transferData.amount);
		} catch (error) {
			console.error('Transfer failed:', error.message);
		}
		await this.waitForEnter();
		await this.tokenUtilities();
	}

	async checkBalance() {
		const response = await prompts({
			type: 'text',
			name: 'address',
			message: 'Enter address to check balance:',
		});
		try {
			const balance = await this.tokenUtils.getBalance(response.address);
			const tokenInfo = await this.tokenUtils.getTokenInfo();
			console.log('Balance:', balance, tokenInfo.symbol);
		} catch (error) {
			console.error('Error:', error.message);
		}

		await this.waitForEnter();
		await this.tokenUtilities();
	}

	async waitForEnter() {
		await prompts({
			type: 'text',
			name: 'continue',
			message: 'Press Enter to continue...',
		});
	}

	// Configuration management
	saveConfiguration() {
		const config = {
			activeWallet: this.activeWallet,
			activeAddressIndex: this.activeAddressIndex,
			activeNetwork: this.activeNetwork,
			activeRpcUrl: this.activeRpcUrl,
		};
		try {
			// Ensure config directory exists
			const configDir = path.dirname(this.configFile);
			if (!existsSync(configDir)) {
				mkdirSync(configDir, { recursive: true });
			}
			writeFileSync(this.configFile, JSON.stringify(config, null, 2));
		} catch (error) {
			// Silently ignore config save errors
		}
	}

	loadConfiguration() {
		try {
			if (existsSync(this.configFile)) {
				const config = JSON.parse(readFileSync(this.configFile, 'utf8'));
				this.activeWallet = config.activeWallet || null;
				this.activeAddressIndex = config.activeAddressIndex || null;
				this.activeNetwork = config.activeNetwork || null;
				this.activeRpcUrl = config.activeRpcUrl || null;

				// Generate address from wallet and index if both are available
				if (this.activeWallet && this.activeAddressIndex !== null) {
					this.activeAddress = this.walletManager.getAddress(this.activeWallet, this.activeAddressIndex);
				} else {
					this.activeAddress = null;
				}
			}
		} catch (error) {
			// Silently ignore config load errors, start fresh
		}
	}

	// Get native currency balance
	async getNativeBalance() {
		if (!this.activeAddress || !this.activeRpcUrl || !this.activeNetwork) {
			return null;
		}

		// Quick validation check first
		if (this.activeRpcUrl.includes('YOUR-PROJECT-ID') || this.activeRpcUrl.includes('your-api-key')) {
			return {
				error: true,
				message: 'Invalid API key in RPC URL',
			};
		}

		// Temporarily suppress ALL console output during entire operation
		const originalWarn = console.warn;
		const originalError = console.error;
		const originalLog = console.log;
		console.warn = () => {};
		console.error = () => {};
		console.log = () => {};

		// Set a flag to suppress errors for longer
		const suppressDuration = 5000; // 5 seconds
		setTimeout(() => {
			console.warn = originalWarn;
			console.error = originalError;
			console.log = originalLog;
		}, suppressDuration);

		try {
			const { ethers } = await import('ethers');
			const network = this.networkManager.getNetwork(this.activeNetwork);

			// Create provider directly here
			let provider;
			if (this.activeRpcUrl.startsWith('ws://') || this.activeRpcUrl.startsWith('wss://')) {
				provider = new ethers.WebSocketProvider(this.activeRpcUrl, {
					name: network.name,
					chainId: network.chainId,
				});
			} else {
				provider = new ethers.JsonRpcProvider(this.activeRpcUrl, {
					name: network.name,
					chainId: network.chainId,
				});
			}

			// Very short timeout
			const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Balance check timeout')), 1500));

			const balance = await Promise.race([provider.getBalance(this.activeAddress), timeoutPromise]);

			// Restore console immediately on success
			console.warn = originalWarn;
			console.error = originalError;
			console.log = originalLog;

			return {
				balance: ethers.formatEther(balance),
				symbol: network.nativeCurrency.symbol,
			};
		} catch (error) {
			// Don't restore console here, let the timeout handle it
			return {
				error: true,
				message: 'RPC connection failed',
			};
		}
	}

	async start() {
		console.log('Starting Smart Contracts Deployment Tool...');
		await this.showMainMenu();
	}
}

// Start the application
const app = new SmartContactsDeploymentTool();
app.start().catch(console.error);
