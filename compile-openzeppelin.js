const solc = require('solc');
const fs = require('fs');
const path = require('path');

console.log('Setting up OpenZeppelin ERC20 compilation...');

// Function to read file content
function readFile(filePath) {
	try {
		return fs.readFileSync(filePath, 'utf8');
	} catch (error) {
		console.error(`Error reading file ${filePath}:`, error.message);
		return null;
	}
}

// Function to find all imports recursively
function findImports(importPath) {
	console.log('Looking for import:', importPath);
	// Try different possible paths
	const possiblePaths = [path.join('./node_modules', importPath), path.join('./contracts', importPath), importPath];
	for (const fullPath of possiblePaths) {
		if (fs.existsSync(fullPath)) {
			console.log('Found import at:', fullPath);
			return { contents: fs.readFileSync(fullPath, 'utf8') };
		}
	}
	console.error('Import not found:', importPath);
	return { error: 'File not found' };
}

// Read the main contract
const mainContract = readFile('./contracts/Token.sol');
if (!mainContract) {
	console.error('Main contract not found!');
	process.exit(1);
}
console.log('Setting up compilation input...');
const input = {
	language: 'Solidity',
	sources: {
		'Token.sol': {
			content: mainContract,
		},
	},
	settings: {
		outputSelection: {
			'*': {
				'*': ['abi', 'evm.bytecode'],
			},
		},
		optimizer: {
			enabled: true,
			runs: 200,
		},
	},
};
console.log('Compiling OpenZeppelin ERC20 contract...');
// Compile with import callback
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
if (output.errors) {
	console.log('Compilation messages:');
	output.errors.forEach(error => {
		if (error.severity === 'error') console.error('ERROR:', error.formattedMessage);
		else console.warn('WARNING:', error.formattedMessage);
	});
}
// Check for successful compilation
if (output.contracts && output.contracts['Token.sol'] && output.contracts['Token.sol']['Token']) {
	const contract = output.contracts['Token.sol']['Token'];
	const result = {
		abi: contract.abi,
		bytecode: '0x' + contract.evm.bytecode.object,
	};
	// Ensure build directory exists
	if (!fs.existsSync('./build')) fs.mkdirSync('./build', { recursive: true });
	fs.writeFileSync('./build/Token.json', JSON.stringify(result, null, 2));
	console.log('✓ OpenZeppelin ERC20 contract compiled successfully');
	console.log('✓ Results saved to build/Token.json');
	console.log('✓ Contract bytecode length:', result.bytecode.length);
} else {
	console.error('Compilation failed - no contract output found');
	if (output.contracts) {
		console.log('Available contracts:', Object.keys(output.contracts));
		Object.keys(output.contracts).forEach(file => console.log(`  File ${file}:`, Object.keys(output.contracts[file])));
	}
	process.exit(1);
}
