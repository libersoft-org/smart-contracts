import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { join, extname, basename } from 'path';

const execAsync = promisify(exec);

export class ContractCompiler {
	constructor() {
		this.buildDir = './build';
		this.contractsDir = './contracts';
	}

	ensureBuildDirectory() {
		if (!existsSync(this.buildDir)) mkdirSync(this.buildDir, { recursive: true });
	}

	/**
	 * Discover all Solidity contracts in the contracts directory
	 */
	discoverContracts() {
		if (!existsSync(this.contractsDir)) {
			console.log('⚠️  No contracts directory found');
			return [];
		}

		const files = readdirSync(this.contractsDir);
		const solidityFiles = files.filter(file => extname(file) === '.sol');
		
		console.log(`📁 Found ${solidityFiles.length} Solidity files:`);
		solidityFiles.forEach((file, index) => {
			console.log(`   ${index + 1}. ${file}`);
		});

		return solidityFiles;
	}

	/**
	 * Analyze a Solidity file to extract contract information
	 */
	analyzeContract(contractFile) {
		const contractPath = join(this.contractsDir, contractFile);
		const content = readFileSync(contractPath, 'utf8');
		
		// Extract contract names
		const contractMatches = content.match(/contract\s+(\w+)/g) || [];
		const contracts = contractMatches.map(match => match.replace('contract ', ''));
		
		// Extract imports
		const importMatches = content.match(/import\s+['"](.*?)['"]/g) || [];
		const imports = importMatches.map(match => {
			const importPath = match.match(/['"](.*?)['"]/)[1];
			return importPath;
		});

		// Extract pragma version
		const pragmaMatch = content.match(/pragma\s+solidity\s+([^;]+)/);
		const solidityVersion = pragmaMatch ? pragmaMatch[1] : '^0.8.0';

		// Try to detect constructor parameters
		const constructorMatch = content.match(/constructor\s*\(([^)]*)\)/);
		let constructorParams = [];
		if (constructorMatch && constructorMatch[1].trim()) {
			const paramsString = constructorMatch[1];
			// Simple parsing - could be improved for complex types
			constructorParams = paramsString.split(',').map(param => {
				const parts = param.trim().split(/\s+/);
				const type = parts[0];
				const name = parts[parts.length - 1];
				return { type, name };
			});
		}

		return {
			file: contractFile,
			contracts,
			imports,
			solidityVersion,
			constructorParams,
			hasConstructor: constructorParams.length > 0
		};
	}

	/**
	 * Universal contract compilation
	 */
	async compile(contractFile = null, targetContract = null) {
		try {
			console.log('🔨 Starting universal contract compilation...');
			this.ensureBuildDirectory();

			// If no specific contract provided, discover available contracts
			if (!contractFile) {
				const availableContracts = this.discoverContracts();
				if (availableContracts.length === 0) {
					console.error('❌ No Solidity contracts found in contracts/ directory');
					return false;
				}
				
				// For now, use the first contract found
				// In future, this could be interactive selection
				contractFile = availableContracts[0];
				console.log(`📄 Auto-selected: ${contractFile}`);
			}

			// Analyze the contract
			const contractInfo = this.analyzeContract(contractFile);
			console.log(`📋 Contract analysis:`);
			console.log(`   📄 File: ${contractInfo.file}`);
			console.log(`   📜 Contracts: ${contractInfo.contracts.join(', ')}`);
			console.log(`   📦 Imports: ${contractInfo.imports.length}`);
			console.log(`   🔧 Constructor params: ${contractInfo.constructorParams.length}`);

			// Determine target contract name
			if (!targetContract) {
				targetContract = contractInfo.contracts[0]; // Use first contract in file
			}

			const buildFile = `./build/${basename(contractFile, '.sol')}.json`;

			// Check if we already have a compiled contract
			if (existsSync(buildFile)) {
				try {
					const existingContract = JSON.parse(readFileSync(buildFile, 'utf8'));
					if (existingContract.abi && existingContract.bytecode) {
						console.log(`✓ Using existing compiled contract from ${buildFile}`);
						return { 
							success: true, 
							contractInfo,
							buildFile,
							contractName: targetContract
						};
					}
				} catch (error) {
					console.log('Existing contract file is invalid, recompiling...');
				}
			}

			// Try universal compilation
			const compilationResult = await this.universalCompile(contractFile, targetContract);
			
			if (compilationResult.success) {
				// Save the compilation result
				writeFileSync(buildFile, JSON.stringify({
					contractName: targetContract,
					abi: compilationResult.abi,
					bytecode: compilationResult.bytecode,
					deployedBytecode: compilationResult.deployedBytecode,
					contractInfo: contractInfo,
					compiledAt: new Date().toISOString()
				}, null, 2));

				console.log(`✓ Contract compiled successfully: ${targetContract}`);
				console.log(`✓ Results saved to ${buildFile}`);
				
				return { 
					success: true, 
					contractInfo,
					buildFile,
					contractName: targetContract,
					abi: compilationResult.abi,
					bytecode: compilationResult.bytecode
				};
			} else {
				console.error('❌ All compilation methods failed');
				return { success: false };
			}

		} catch (error) {
			console.error('❌ Compilation failed:', error.message);
			return { success: false, error: error.message };
		}
	}

	/**
	 * Universal compilation method that tries multiple approaches
	 */
	async universalCompile(contractFile, targetContract) {
		const contractPath = join(this.contractsDir, contractFile);

		// Method 1: Try solc with dynamic import resolution
		try {
			console.log('🔧 Attempting solc compilation with import resolution...');
			
			const command = `solc --combined-json abi,bin --include-path ./node_modules/ --base-path . ${contractPath}`;
			const { stdout } = await execAsync(command);
			
			const compiledContract = JSON.parse(stdout);
			const contractKey = `${contractPath}:${targetContract}`;
			const contract = compiledContract.contracts[contractKey];
			
			if (contract) {
				return {
					success: true,
					abi: JSON.parse(contract.abi),
					bytecode: '0x' + contract.bin,
					deployedBytecode: null
				};
			}
		} catch (error) {
			console.log('Method 1 failed:', error.message);
		}

		// Method 2: Try solcjs with dynamic paths
		try {
			console.log('🔧 Attempting solcjs compilation...');
			
			const abiCommand = `node_modules\\.bin\\solcjs --abi --include-path ./node_modules/ --base-path . -o ./build ${contractPath}`;
			const binCommand = `node_modules\\.bin\\solcjs --bin --include-path ./node_modules/ --base-path . -o ./build ${contractPath}`;

			await execAsync(abiCommand);
			await execAsync(binCommand);

			// Try to find the generated files
			const buildFiles = readdirSync('./build');
			const abiFile = buildFiles.find(f => f.includes(basename(contractFile, '.sol')) && f.includes(targetContract) && f.endsWith('.abi'));
			const binFile = buildFiles.find(f => f.includes(basename(contractFile, '.sol')) && f.includes(targetContract) && f.endsWith('.bin'));

			if (abiFile && binFile) {
				const abi = JSON.parse(readFileSync(join('./build', abiFile), 'utf8'));
				const bytecode = '0x' + readFileSync(join('./build', binFile), 'utf8').trim();

				return {
					success: true,
					abi,
					bytecode,
					deployedBytecode: null
				};
			}
		} catch (error) {
			console.log('Method 2 failed:', error.message);
		}

		// Method 3: Try programmatic solc compilation
		try {
			console.log('🔧 Attempting programmatic solc compilation...');
			
			const solc = require('solc');
			const contractContent = readFileSync(contractPath, 'utf8');
			
			// Create import resolver
			const findImports = (importPath) => {
				const possiblePaths = [
					join('./node_modules', importPath),
					join('./contracts', importPath),
					importPath
				];
				
				for (const fullPath of possiblePaths) {
					if (existsSync(fullPath)) {
						return { contents: readFileSync(fullPath, 'utf8') };
					}
				}
				return { error: 'File not found' };
			};

			const input = {
				language: 'Solidity',
				sources: {
					[contractFile]: {
						content: contractContent,
					},
				},
				settings: {
					outputSelection: {
						'*': {
							'*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'],
						},
					},
					optimizer: {
						enabled: true,
						runs: 200,
					},
				},
			};

			const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
			
			if (output.contracts && output.contracts[contractFile] && output.contracts[contractFile][targetContract]) {
				const contract = output.contracts[contractFile][targetContract];
				
				return {
					success: true,
					abi: contract.abi,
					bytecode: '0x' + contract.evm.bytecode.object,
					deployedBytecode: contract.evm.deployedBytecode ? '0x' + contract.evm.deployedBytecode.object : null
				};
			}
		} catch (error) {
			console.log('Method 3 failed:', error.message);
		}

		return { success: false };
	}
}
