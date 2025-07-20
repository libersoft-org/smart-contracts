import { readFileSync } from 'fs';
import { ethers } from 'ethers';
import { NetworkManager } from './NetworkManager.js';

export class ContractVerifier {
	constructor() {
		this.networkManager = new NetworkManager();
	}

	getApiEndpoint(chainId) {
		const networks = this.networkManager.getNetworks();
		const network = networks.find(net => net.chainId === chainId);
		
		if (!network || !network.explorerURL) {
			return null;
		}

		// Convert explorer URL to API endpoint
		const explorerUrl = network.explorerURL;
		
		try {
			const url = new URL(explorerUrl);
			// For most explorers, API is available at api.hostname
			return `https://api.${url.hostname}/api`;
		} catch {
			return null;
		}
	}

	async verifyContract(contractAddress, chainId, tokenConfig, apiKey) {
		try {
			const apiUrl = this.getApiEndpoint(chainId);
			if (!apiUrl) {
				console.log('⚠️ Contract verification not supported for this network');
				return false;
			}

			console.log('Starting contract verification...');

			// Wait a bit for the contract to be indexed by the block explorer
			console.log('⏳ Waiting for contract to be indexed by block explorer...');
			await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds

			// Load contract source and metadata
			const contractJson = JSON.parse(readFileSync('./build/Token.json', 'utf8'));
			
			// Prepare standard JSON input for multi-file verification
			console.log('📄 Preparing standard JSON input...');
			const standardJsonInput = this.createStandardJsonInput();

			// Prepare constructor arguments (ABI encoded)
			const constructorArgs = this.encodeConstructorArgs(tokenConfig);

			// Prepare verification payload
			const verificationData = {
				apikey: apiKey,
				module: 'contract',
				action: 'verifysourcecode',
				contractaddress: contractAddress,
				sourceCode: standardJsonInput,
				codeformat: 'solidity-standard-json-input',
				contractname: 'Token.sol:Token',
				compilerversion: 'v0.8.20+commit.a1b79de6',
				optimizationUsed: '1',
				runs: '200',
				constructorArguments: constructorArgs,
				licenseType: '3', // MIT License
			};

			// Submit verification with retry logic
			let response;
			let retryCount = 0;
			const maxRetries = 3;
			
			while (retryCount < maxRetries) {
				response = await this.submitVerification(apiUrl, verificationData);
				
				// If contract not found, wait and retry
				if (response.status === '0' && response.result && response.result.includes('Unable to locate ContractCode')) {
					retryCount++;
					if (retryCount < maxRetries) {
						console.log(`⏳ Contract not yet indexed, retrying in 10 seconds... (${retryCount}/${maxRetries})`);
						await new Promise(resolve => setTimeout(resolve, 10000));
						continue;
					}
				}
				break;
			}
			
			if (response.status === '1') {
				console.log('✓ Verification submitted successfully');
				console.log('GUID:', response.result);
				
				// Check verification status
				const verificationResult = await this.checkVerificationStatus(apiUrl, response.result, apiKey);
				return verificationResult;
			} else {
				console.error('✗ Verification failed:', response.message);
				console.error('Result:', response.result);
				return false;
			}

		} catch (error) {
			console.error('Verification error:', error.message);
			return false;
		}
	}

	createStandardJsonInput() {
		try {
			const tokenSource = readFileSync('./contracts/Token.sol', 'utf8');
			
			// Read OpenZeppelin contract sources
			const erc20Source = readFileSync('./node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol', 'utf8');
			const ierc20Source = readFileSync('./node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol', 'utf8');
			const ierc20MetadataSource = readFileSync('./node_modules/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol', 'utf8');
			const contextSource = readFileSync('./node_modules/@openzeppelin/contracts/utils/Context.sol', 'utf8');
			const ierc6093Source = readFileSync('./node_modules/@openzeppelin/contracts/interfaces/draft-IERC6093.sol', 'utf8');
			
			const standardInput = {
				language: 'Solidity',
				sources: {
					'Token.sol': {
						content: tokenSource
					},
					'@openzeppelin/contracts/token/ERC20/ERC20.sol': {
						content: erc20Source
					},
					'@openzeppelin/contracts/token/ERC20/IERC20.sol': {
						content: ierc20Source
					},
					'@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol': {
						content: ierc20MetadataSource
					},
					'@openzeppelin/contracts/utils/Context.sol': {
						content: contextSource
					},
					'@openzeppelin/contracts/interfaces/draft-IERC6093.sol': {
						content: ierc6093Source
					}
				},
				settings: {
					optimizer: {
						enabled: true,
						runs: 200
					},
					outputSelection: {
						'*': {
							'*': ['*']
						}
					}
				}
			};
			
			return JSON.stringify(standardInput);
		} catch (error) {
			console.error('Error creating standard JSON input:', error.message);
			throw new Error('Could not read OpenZeppelin contract sources');
		}
	}

	encodeConstructorArgs(tokenConfig) {
		try {
			// Encode constructor arguments for Token contract
			// constructor(string memory _name, string memory _symbol, uint8 _decimalsValue, uint256 _totalSupply)
			const abiCoder = ethers.AbiCoder.defaultAbiCoder();
			
			const encoded = abiCoder.encode(
				['string', 'string', 'uint8', 'uint256'],
				[
					tokenConfig.name,
					tokenConfig.symbol,
					tokenConfig.decimals,
					ethers.parseUnits(tokenConfig.totalSupply.toString(), tokenConfig.decimals)
				]
			);
			
			// Remove '0x' prefix for the API
			return encoded.slice(2);
		} catch (error) {
			console.log('Warning: Could not encode constructor arguments:', error.message);
			return '';
		}
	}

	async submitVerification(apiUrl, data) {
		const formData = new URLSearchParams();
		Object.keys(data).forEach(key => {
			formData.append(key, data[key]);
		});

		const response = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: formData,
		});

		return await response.json();
	}

	async checkVerificationStatus(apiUrl, guid, apiKey) {
		console.log('Checking verification status...');
		
		for (let i = 0; i < 10; i++) {
			await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
			
			const statusResponse = await fetch(`${apiUrl}?module=contract&action=checkverifystatus&guid=${guid}&apikey=${apiKey}`);
			const statusData = await statusResponse.json();
			
			if (statusData.status === '1') {
				console.log('✓ Contract verified successfully!');
				return true;
			} else if (statusData.result === 'Pending in queue') {
				console.log('⏳ Verification in progress...');
				continue;
			} else {
				console.error('✗ Verification failed:', statusData.result);
				return false;
			}
		}
		
		console.log('⚠️ Verification timeout - check manually on block explorer');
		return false;
	}
}
