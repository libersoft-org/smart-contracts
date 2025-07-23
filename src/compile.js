import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { join, extname, basename } from 'path';

const execAsync = promisify(exec);

export class ContractCompiler {
	constructor() {
		this.buildDir = './build';
		this.contractsDir = './contracts';
		this.debug = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
	}

	debugLog(message) {
		if (this.debug) {
			console.log(message);
		}
	}

	ensureBuildDirectory() {
		this.debugLog(`🔍 [DEBUG] Checking build directory: ${this.buildDir}`);
		if (!existsSync(this.buildDir)) {
			this.debugLog(`🔍 [DEBUG] Build directory doesn't exist, creating...`);
			mkdirSync(this.buildDir, { recursive: true });
			this.debugLog(`🔍 [DEBUG] Build directory created successfully`);
		} else {
			this.debugLog(`🔍 [DEBUG] Build directory already exists`);
		}
	}

	/**
	 * Discover all Solidity contracts in the contracts directory
	 */
	discoverContracts() {
		this.debugLog(`🔍 [DEBUG] Checking contracts directory: ${this.contractsDir}`);
		if (!existsSync(this.contractsDir)) {
			console.log('⚠️  No contracts directory found');
			return [];
		}

		this.debugLog(`🔍 [DEBUG] Reading directory contents...`);
		const files = readdirSync(this.contractsDir);
		this.debugLog(`🔍 [DEBUG] Total files found: ${files.length} - [${files.join(', ')}]`);
		
		const solidityFiles = files.filter(file => extname(file) === '.sol');
		this.debugLog(`🔍 [DEBUG] Filtered to Solidity files: ${solidityFiles.length}`);
		
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
		this.debugLog(`🔍 [DEBUG] Analyzing contract: ${contractPath}`);
		
		const content = readFileSync(contractPath, 'utf8');
		this.debugLog(`🔍 [DEBUG] Contract file size: ${content.length} characters`);
		
		// Extract contract names
		const contractMatches = content.match(/contract\s+(\w+)/g) || [];
		const contracts = contractMatches.map(match => match.replace('contract ', ''));
		this.debugLog(`🔍 [DEBUG] Contract names found: [${contracts.join(', ')}]`);
		
		// Extract imports
		const importMatches = content.match(/import\s+['"](.*?)['"]/g) || [];
		const imports = importMatches.map(match => {
			const importPath = match.match(/['"](.*?)['"]/)[1];
			return importPath;
		});
		this.debugLog(`🔍 [DEBUG] Imports found: [${imports.join(', ')}]`);

		// Extract pragma version
		const pragmaMatch = content.match(/pragma\s+solidity\s+([^;]+)/);
		const solidityVersion = pragmaMatch ? pragmaMatch[1] : '^0.8.0';
		this.debugLog(`🔍 [DEBUG] Solidity version: ${solidityVersion}`);

		// Try to detect constructor parameters
		const constructorMatch = content.match(/constructor\s*\(([^)]*)\)/);
		let constructorParams = [];
		if (constructorMatch && constructorMatch[1].trim()) {
			const paramsString = constructorMatch[1];
			this.debugLog(`🔍 [DEBUG] Constructor params string: ${paramsString}`);
			// Simple parsing - could be improved for complex types
			constructorParams = paramsString.split(',').map(param => {
				const parts = param.trim().split(/\s+/);
				const type = parts[0];
				const name = parts[parts.length - 1];
				return { type, name };
			});
		}
		this.debugLog(`🔍 [DEBUG] Constructor parameters parsed: ${JSON.stringify(constructorParams)}`);

		const analysisResult = {
			file: contractFile,
			contracts,
			imports,
			solidityVersion,
			constructorParams,
			hasConstructor: constructorParams.length > 0
		};
		
		this.debugLog(`🔍 [DEBUG] Analysis complete for ${contractFile}:`);
		this.debugLog(`🔍 [DEBUG] - Contracts: ${contracts.length}`);
		this.debugLog(`🔍 [DEBUG] - Imports: ${imports.length}`);
		this.debugLog(`🔍 [DEBUG] - Has constructor: ${analysisResult.hasConstructor}`);

		return analysisResult;
	}

	/**
	 * Universal contract compilation
	 */
	async compile(contractFile = null, targetContract = null) {
		try {
			console.log('🔨 Starting universal contract compilation...');
			this.debugLog(`🔍 [DEBUG] Input parameters - contractFile: ${contractFile}, targetContract: ${targetContract}`);
			
			this.ensureBuildDirectory();
			this.debugLog(`🔍 [DEBUG] Build directory ensured: ${this.buildDir}`);

			// If no specific contract provided, discover available contracts
			if (!contractFile) {
				this.debugLog(`🔍 [DEBUG] No contract file specified, discovering contracts...`);
				const availableContracts = this.discoverContracts();
				if (availableContracts.length === 0) {
					console.error('❌ No Solidity contracts found in contracts/ directory');
					return false;
				}
				
				// For now, use the first contract found
				// In future, this could be interactive selection
				contractFile = availableContracts[0];
				console.log(`📄 Auto-selected: ${contractFile}`);
				this.debugLog(`🔍 [DEBUG] Selected contract file: ${contractFile}`);
			}

			// Analyze the contract
			this.debugLog(`🔍 [DEBUG] Starting contract analysis...`);
			const contractInfo = this.analyzeContract(contractFile);
			console.log(`📋 Contract analysis:`);
			console.log(`   📄 File: ${contractInfo.file}`);
			console.log(`   📜 Contracts: ${contractInfo.contracts.join(', ')}`);
			console.log(`   📦 Imports: ${contractInfo.imports.length}`);
			console.log(`   🔧 Constructor params: ${contractInfo.constructorParams.length}`);

			// Determine target contract name
			if (!targetContract) {
				targetContract = contractInfo.contracts[0]; // Use first contract in file
				this.debugLog(`🔍 [DEBUG] No target contract specified, using first found: ${targetContract}`);
			}

			const buildFile = `./build/${basename(contractFile, '.sol')}.json`;
			this.debugLog(`🔍 [DEBUG] Build file path: ${buildFile}`);

			// Check if we already have a compiled contract
			if (existsSync(buildFile)) {
				this.debugLog(`🔍 [DEBUG] Existing build file found, checking validity...`);
				try {
					const existingContract = JSON.parse(readFileSync(buildFile, 'utf8'));
					if (existingContract.abi && existingContract.bytecode) {
						console.log(`✓ Using existing compiled contract from ${buildFile}`);
						this.debugLog(`🔍 [DEBUG] Existing contract has valid ABI and bytecode`);
						return { 
							success: true, 
							contractInfo,
							buildFile,
							contractName: targetContract,
							abi: existingContract.abi,
							bytecode: existingContract.bytecode
						};
					} else {
						this.debugLog(`🔍 [DEBUG] Existing contract missing ABI or bytecode, recompiling...`);
					}
				} catch (error) {
					console.log('Existing contract file is invalid, recompiling...');
					this.debugLog(`🔍 [DEBUG] Error parsing existing build file: ${error.message}`);
				}
			} else {
				this.debugLog(`🔍 [DEBUG] No existing build file found`);
			}

			// Try universal compilation
			this.debugLog(`🔍 [DEBUG] Starting universal compilation process...`);
			const compilationResult = await this.universalCompile(contractFile, targetContract);
			
			if (compilationResult.success) {
				this.debugLog(`🔍 [DEBUG] Compilation successful, saving results...`);
				// Save the compilation result
				const resultData = {
					contractName: targetContract,
					abi: compilationResult.abi,
					bytecode: compilationResult.bytecode,
					deployedBytecode: compilationResult.deployedBytecode,
					contractInfo: contractInfo,
					compiledAt: new Date().toISOString()
				};
				
				writeFileSync(buildFile, JSON.stringify(resultData, null, 2));
				this.debugLog(`🔍 [DEBUG] Build file written with ${JSON.stringify(resultData).length} characters`);

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
				this.debugLog(`🔍 [DEBUG] Universal compilation returned failure`);
				return { success: false };
			}

		} catch (error) {
			console.error('❌ Compilation failed:', error.message);
			this.debugLog(`🔍 [DEBUG] Exception in compile(): ${error.stack}`);
			return { success: false, error: error.message };
		}
	}

	/**
	 * Universal compilation method that tries multiple approaches
	 */
	async universalCompile(contractFile, targetContract) {
		const contractPath = join(this.contractsDir, contractFile);
		this.debugLog(`🔍 [DEBUG] Universal compile starting - file: ${contractFile}, target: ${targetContract}`);
		this.debugLog(`🔍 [DEBUG] Full contract path: ${contractPath}`);

		// Method 1: Try solc with dynamic import resolution
		try {
			console.log('🔧 Attempting solc compilation with import resolution...');
			
			const command = `solc --combined-json abi,bin --include-path ./node_modules/ --base-path . ${contractPath}`;
			this.debugLog(`🔍 [DEBUG] Method 1 - Executing command: ${command}`);
			
			const { stdout } = await execAsync(command);
			this.debugLog(`🔍 [DEBUG] Method 1 - Command output length: ${stdout.length} characters`);
			this.debugLog(`🔍 [DEBUG] Method 1 - Raw output: ${stdout.substring(0, 200)}...`);
			
			const compiledContract = JSON.parse(stdout);
			this.debugLog(`🔍 [DEBUG] Method 1 - Parsed JSON, available contracts: ${Object.keys(compiledContract.contracts || {}).join(', ')}`);
			
			const contractKey = `${contractPath}:${targetContract}`;
			this.debugLog(`🔍 [DEBUG] Method 1 - Looking for contract key: ${contractKey}`);
			const contract = compiledContract.contracts[contractKey];
			
			if (contract) {
				this.debugLog(`🔍 [DEBUG] Method 1 - Contract found! ABI length: ${contract.abi.length}, Bytecode length: ${contract.bin.length}`);
				return {
					success: true,
					abi: JSON.parse(contract.abi),
					bytecode: '0x' + contract.bin,
					deployedBytecode: null
				};
			} else {
				this.debugLog(`🔍 [DEBUG] Method 1 - Contract not found for key: ${contractKey}`);
			}
		} catch (error) {
			console.log('Method 1 failed:', error.message);
			this.debugLog(`🔍 [DEBUG] Method 1 - Error details: ${error.stack}`);
		}

		// Method 2: Try solcjs with dynamic paths
		try {
			console.log('🔧 Attempting solcjs compilation...');
			
			const abiCommand = `node_modules\\.bin\\solcjs --abi --include-path ./node_modules/ --base-path . -o ./build ${contractPath}`;
			const binCommand = `node_modules\\.bin\\solcjs --bin --include-path ./node_modules/ --base-path . -o ./build ${contractPath}`;

			this.debugLog(`🔍 [DEBUG] Method 2 - ABI command: ${abiCommand}`);
			await execAsync(abiCommand);
			this.debugLog(`🔍 [DEBUG] Method 2 - ABI command completed`);
			
			this.debugLog(`🔍 [DEBUG] Method 2 - BIN command: ${binCommand}`);
			await execAsync(binCommand);
			this.debugLog(`🔍 [DEBUG] Method 2 - BIN command completed`);

			// Try to find the generated files
			const buildFiles = readdirSync('./build');
			this.debugLog(`🔍 [DEBUG] Method 2 - Build files after compilation: [${buildFiles.join(', ')}]`);
			
			const abiFile = buildFiles.find(f => f.includes(basename(contractFile, '.sol')) && f.includes(targetContract) && f.endsWith('.abi'));
			const binFile = buildFiles.find(f => f.includes(basename(contractFile, '.sol')) && f.includes(targetContract) && f.endsWith('.bin'));
			
			this.debugLog(`🔍 [DEBUG] Method 2 - Looking for files containing: ${basename(contractFile, '.sol')} and ${targetContract}`);
			this.debugLog(`🔍 [DEBUG] Method 2 - Found ABI file: ${abiFile}`);
			this.debugLog(`🔍 [DEBUG] Method 2 - Found BIN file: ${binFile}`);

			if (abiFile && binFile) {
				this.debugLog(`🔍 [DEBUG] Method 2 - Reading files...`);
				const abi = JSON.parse(readFileSync(join('./build', abiFile), 'utf8'));
				const bytecode = '0x' + readFileSync(join('./build', binFile), 'utf8').trim();
				
				this.debugLog(`🔍 [DEBUG] Method 2 - Success! ABI entries: ${abi.length}, Bytecode length: ${bytecode.length}`);

				return {
					success: true,
					abi,
					bytecode,
					deployedBytecode: null
				};
			} else {
				this.debugLog(`🔍 [DEBUG] Method 2 - Required files not found`);
			}
		} catch (error) {
			console.log('Method 2 failed:', error.message);
			this.debugLog(`🔍 [DEBUG] Method 2 - Error details: ${error.stack}`);
		}

		// Method 3: Try programmatic solc compilation
		try {
			console.log('🔧 Attempting programmatic solc compilation...');
			
			this.debugLog(`🔍 [DEBUG] Method 3 - Requiring solc module...`);
			const solc = require('solc');
			this.debugLog(`🔍 [DEBUG] Method 3 - solc version: ${solc.version()}`);
			
			const contractContent = readFileSync(contractPath, 'utf8');
			this.debugLog(`🔍 [DEBUG] Method 3 - Contract content length: ${contractContent.length} characters`);
			
			// Create import resolver
			const findImports = (importPath) => {
				this.debugLog(`🔍 [DEBUG] Method 3 - Resolving import: ${importPath}`);
				const possiblePaths = [
					join('./node_modules', importPath),
					join('./contracts', importPath),
					importPath
				];
				
				for (const fullPath of possiblePaths) {
					this.debugLog(`🔍 [DEBUG] Method 3 - Checking path: ${fullPath}`);
					if (existsSync(fullPath)) {
						this.debugLog(`🔍 [DEBUG] Method 3 - Found import at: ${fullPath}`);
						return { contents: readFileSync(fullPath, 'utf8') };
					}
				}
				this.debugLog(`🔍 [DEBUG] Method 3 - Import not found: ${importPath}`);
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

			this.debugLog(`🔍 [DEBUG] Method 3 - Compilation input prepared`);
			this.debugLog(`🔍 [DEBUG] Method 3 - Starting compilation...`);
			const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
			this.debugLog(`🔍 [DEBUG] Method 3 - Compilation completed`);
			
			if (output.errors) {
				this.debugLog(`🔍 [DEBUG] Method 3 - Compilation errors/warnings: ${output.errors.length}`);
				output.errors.forEach((error, index) => {
					this.debugLog(`🔍 [DEBUG] Method 3 - Error ${index + 1}: ${error.severity} - ${error.message}`);
				});
			}
			
			if (output.contracts) {
				this.debugLog(`🔍 [DEBUG] Method 3 - Contract files in output: [${Object.keys(output.contracts).join(', ')}]`);
				if (output.contracts[contractFile]) {
					this.debugLog(`🔍 [DEBUG] Method 3 - Contracts in file: [${Object.keys(output.contracts[contractFile]).join(', ')}]`);
				}
			}
			
			if (output.contracts && output.contracts[contractFile] && output.contracts[contractFile][targetContract]) {
				const contract = output.contracts[contractFile][targetContract];
				this.debugLog(`🔍 [DEBUG] Method 3 - Target contract found!`);
				this.debugLog(`🔍 [DEBUG] Method 3 - ABI entries: ${contract.abi.length}`);
				this.debugLog(`🔍 [DEBUG] Method 3 - Bytecode length: ${contract.evm.bytecode.object.length}`);
				
				return {
					success: true,
					abi: contract.abi,
					bytecode: '0x' + contract.evm.bytecode.object,
					deployedBytecode: contract.evm.deployedBytecode ? '0x' + contract.evm.deployedBytecode.object : null
				};
			} else {
				this.debugLog(`🔍 [DEBUG] Method 3 - Target contract not found in output`);
			}
		} catch (error) {
			console.log('Method 3 failed:', error.message);
			this.debugLog(`🔍 [DEBUG] Method 3 - Error details: ${error.stack}`);
		}

		this.debugLog(`🔍 [DEBUG] All compilation methods failed`);
		return { success: false };
	}
}
