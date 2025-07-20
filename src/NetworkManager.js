import { readFileSync, existsSync } from 'fs';

export class NetworkManager {
	constructor() {
		this.networks = this.loadNetworks();
	}

	loadNetworks() {
		if (!existsSync('./src/networks.json')) throw new Error('networks.json not found');
		const networksArray = JSON.parse(readFileSync('./src/networks.json', 'utf8'));
		// Convert array to object with name as key
		const networksObject = {};
		networksArray.forEach(network => {
			networksObject[network.name] = {
				name: network.name,
				chainId: network.chainID,
				rpcUrls: network.rpcURLs,
				nativeCurrency: {
					name: network.currency.symbol,
					symbol: network.currency.symbol,
					decimals: 18,
				},
				explorerUrl: network.explorerURL,
			};
		});
		return networksObject;
	}

	getNetworkNames() {
		return Object.keys(this.networks);
	}

	getNetwork(networkName) {
		if (!this.networks[networkName]) throw new Error('Network not found: ' + networkName);
		return this.networks[networkName];
	}

	getNetworkByChainId(chainId) {
		for (const networkName in this.networks) {
			if (this.networks[networkName].chainId === chainId) return this.networks[networkName];
		}
		return null;
	}

	getRpcUrls(networkName) {
		const network = this.getNetwork(networkName);
		return network.rpcUrls;
	}

	// Keep testing method for potential future use
	async testRpcUrl(rpcUrl, networkName) {
		// Temporarily suppress console warnings during RPC testing
		const originalWarn = console.warn;
		const originalError = console.error;
		console.warn = () => {};
		console.error = () => {};
		try {
			const { ethers } = await import('ethers');
			const provider = new ethers.JsonRpcProvider(rpcUrl);
			// Test with a short timeout
			const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), 2000));
			// Try to get network info
			await Promise.race([provider.getNetwork(), timeoutPromise]);
			return true;
		} catch (error) {
			return false;
		} finally {
			// Restore console functions
			console.warn = originalWarn;
			console.error = originalError;
		}
	}

	// Return all RPC URLs without testing
	getAllRpcUrls(networkName) {
		const rpcUrls = this.getRpcUrls(networkName);
		return rpcUrls.map(url => ({
			url: url,
			working: true, // Assume all are working
		}));
	}

	// Create provider based on URL type (HTTP/HTTPS or WS/WSS)
	async createProvider(rpcUrl, networkName, suppressErrors = false) {
		// Temporarily suppress console warnings if requested
		let originalWarn, originalError, originalLog;
		if (suppressErrors) {
			originalWarn = console.warn;
			originalError = console.error;
			originalLog = console.log;
			console.warn = () => {};
			console.error = () => {};
			console.log = () => {};
		}
		try {
			const { ethers } = await import('ethers');
			const network = this.getNetwork(networkName);
			const networkConfig = {
				name: network.name,
				chainId: network.chainId,
			};
			if (rpcUrl.startsWith('ws://') || rpcUrl.startsWith('wss://')) return new ethers.WebSocketProvider(rpcUrl, networkConfig);
			else return new ethers.JsonRpcProvider(rpcUrl, networkConfig);
		} finally {
			// Restore console functions if they were suppressed
			if (suppressErrors) {
				console.warn = originalWarn;
				console.error = originalError;
				console.log = originalLog;
			}
		}
	}

	// Check if URL is WebSocket
	isWebSocketUrl(url) {
		return url.startsWith('ws://') || url.startsWith('wss://');
	}

	// Get provider type description
	getProviderType(url) {
		return this.isWebSocketUrl(url) ? 'WebSocket' : 'HTTP/HTTPS';
	}
}
