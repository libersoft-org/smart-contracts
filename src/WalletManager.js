import { ethers, getIndexedAccountPath, HDNodeWallet, Mnemonic } from 'ethers';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

export class WalletManager {
	constructor() {
		this.walletsFile = './config/wallets.json';
		this.wallets = this.loadWallets();
	}

	loadWallets() {
		if (!existsSync(this.walletsFile)) return {};
		try {
			return JSON.parse(readFileSync(this.walletsFile, 'utf8'));
		} catch (error) {
			console.log('Error loading wallets file:', error.message);
			return {};
		}
	}

	saveWallets() {
		// Ensure config directory exists
		const configDir = path.dirname(this.walletsFile);
		if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
		writeFileSync(this.walletsFile, JSON.stringify(this.wallets, null, 2));
	}

	addWallet(name, seedPhrase) {
		try {
			// Validate seed phrase
			Mnemonic.fromPhrase(seedPhrase);
			this.wallets[name] = {
				seedPhrase: seedPhrase,
				addresses: [],
			};
			this.saveWallets();
			return true;
		} catch (error) {
			throw new Error('Invalid seed phrase: ' + error.message);
		}
	}

	removeWallet(name) {
		if (!this.wallets[name]) throw new Error('Wallet not found: ' + name);
		delete this.wallets[name];
		this.saveWallets();
	}

	getWalletNames() {
		return Object.keys(this.wallets);
	}

	addAddress(walletName, index) {
		if (!this.wallets[walletName]) throw new Error('Wallet not found: ' + walletName);
		const wallet = this.wallets[walletName];
		if (wallet.addresses.includes(index)) throw new Error('Address index already exists: ' + index);
		wallet.addresses.push(index);
		this.saveWallets();
	}

	removeAddress(walletName, index) {
		if (!this.wallets[walletName]) throw new Error('Wallet not found: ' + walletName);
		const wallet = this.wallets[walletName];
		const indexPos = wallet.addresses.indexOf(index);
		if (indexPos === -1) throw new Error('Address index not found: ' + index);
		wallet.addresses.splice(indexPos, 1);
		this.saveWallets();
	}

	getAddresses(walletName) {
		if (!this.wallets[walletName]) throw new Error('Wallet not found: ' + walletName);
		const wallet = this.wallets[walletName];
		return wallet.addresses.map(index => {
			const mn = Mnemonic.fromPhrase(wallet.seedPhrase);
			const path = getIndexedAccountPath(index);
			const hdWallet = HDNodeWallet.fromMnemonic(mn, path);
			return {
				index: index,
				address: hdWallet.address,
				privateKey: hdWallet.privateKey,
			};
		});
	}

	getAddress(walletName, addressIndex) {
		if (!this.wallets[walletName]) return null;
		const wallet = this.wallets[walletName];
		// Check if this index exists in the wallet
		if (!wallet.addresses.includes(addressIndex)) return null;
		try {
			const mn = Mnemonic.fromPhrase(wallet.seedPhrase);
			const path = getIndexedAccountPath(addressIndex);
			const hdWallet = HDNodeWallet.fromMnemonic(mn, path);
			return hdWallet.address;
		} catch (error) {
			return null;
		}
	}

	getWalletInfo(walletName, addressIndex) {
		if (!this.wallets[walletName]) return null;
		const wallet = this.wallets[walletName];
		// Check if this index exists in the wallet
		if (!wallet.addresses.includes(addressIndex)) return null;
		try {
			const mn = Mnemonic.fromPhrase(wallet.seedPhrase);
			const path = getIndexedAccountPath(addressIndex);
			const hdWallet = HDNodeWallet.fromMnemonic(mn, path);
			return {
				address: hdWallet.address,
				privateKey: hdWallet.privateKey,
				index: addressIndex,
			};
		} catch (error) {
			return null;
		}
	}

	async getAddressInfo(walletName, index, provider) {
		const addresses = this.getAddresses(walletName);
		const addressInfo = addresses.find(addr => addr.index === index);
		if (!addressInfo) throw new Error('Address not found');
		try {
			const balance = await provider.getBalance(addressInfo.address);
			return {
				...addressInfo,
				balance: ethers.formatEther(balance),
			};
		} catch (error) {
			return {
				...addressInfo,
				balance: 'N/A',
			};
		}
	}
}
